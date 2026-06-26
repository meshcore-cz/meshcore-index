// Command meshcore-ninja-api connects to every CoreScope analyzer declared in
// the data/networks/*/network.yaml files, counts unique packets (deduplicated
// by content hash), observations and observers, and serves the rollups over a
// small read-only REST API for the MeshCore Ninja frontend to poll.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	dataDir := flag.String("data", "../data", "path to the repo's data/ directory")
	allowOrigin := flag.String("allow-origin", "*", "Access-Control-Allow-Origin value")
	dedupWindow := flag.Duration("dedup-window", 15*time.Minute, "how long a content hash counts as already-seen")
	linkHalfLife := flag.Duration("link-halflife", 24*time.Hour, "half-life of a link's recent-activity score")
	observerTTL := flag.Duration("observer-ttl", time.Hour, "drop observers/nodes idle longer than this")
	dbPath := flag.String("db", "meshcore.db", "SQLite file for persisting counters across restarts (empty = in-memory only)")
	persistEvery := flag.Duration("persist-interval", 20*time.Second, "how often to flush counters/nodes to --db")
	observerPersistEvery := flag.Duration("observer-persist-interval", 12*time.Second, "how often to flush observer activity to --db")
	importURL := flag.String("import-url", defaultImportURL, "external node directory to mirror hourly (empty = disabled)")
	importEvery := flag.Duration("import-interval", time.Hour, "how often to sync the external node directory")
	flag.Parse()

	configs, err := LoadNetworks(*dataDir)
	if err != nil {
		log.Fatalf("loading networks: %v", err)
	}
	analyzerCount := 0
	for _, c := range configs {
		analyzerCount += len(c.Analyzers)
	}
	log.Printf("loaded %d networks with %d analyzers from %s", len(configs), analyzerCount, *dataDir)

	store := NewStore(configs)
	registry := newNodeRegistry(defaultAdvertsPerNode)
	observers := newObserverRegistry()
	links := newLinkRegistry(linkHalfLife.Seconds())
	imported := newImportRegistry()
	metrics := NewMetrics()

	// Pre-create the analyzer gauges so every configured analyzer reports
	// "disconnected" (0) immediately, rather than appearing only after its first
	// connection attempt.
	for _, ns := range store.Networks {
		for _, az := range ns.Analyzers {
			metrics.initAnalyzer(ns.ID, az.Name)
		}
	}

	// Optional durable counter store. When --db is set we restore the last
	// persisted snapshot before any collector runs, so totals and the
	// node/observer gauges continue across restarts. Each restore phase is timed
	// so a slow startup points at the offending query.
	var db *DB
	loadAdverts := false // backfill per-node advert history in the background after startup
	if *dbPath != "" {
		bootStart := time.Now()
		t := time.Now()
		db, err = OpenDB(*dbPath)
		if err != nil {
			log.Fatalf("opening db %s: %v", *dbPath, err)
		}
		log.Printf("startup: opened db %s in %s", *dbPath, time.Since(t).Round(time.Millisecond))
		defer db.Close()

		t = time.Now()
		if states, err := db.Load(); err != nil {
			log.Printf("warning: loading persisted counters: %v", err)
		} else if len(states) > 0 {
			store.Restore(states)
			log.Printf("startup: restored counters for %d scope(s) in %s", len(states), time.Since(t).Round(time.Millisecond))
		}

		t = time.Now()
		if nodes, err := db.LoadNodes(); err != nil {
			log.Printf("warning: loading persisted nodes: %v", err)
		} else if len(nodes) > 0 {
			// Restore the node overview rows now (fast); the per-node rolling
			// advert lists are backfilled asynchronously below — that history scan
			// is the slow part and the map never needs it.
			registry.Restore(nodes, nil)
			log.Printf("startup: restored %d node row(s) in %s", len(nodes), time.Since(t).Round(time.Millisecond))
			loadAdverts = true
		}

		t = time.Now()
		if obs, err := db.LoadObservers(); err != nil {
			log.Printf("warning: loading persisted observers: %v", err)
		} else if len(obs) > 0 {
			observers.Restore(obs)
			log.Printf("startup: restored %d observer(s) in %s", len(obs), time.Since(t).Round(time.Millisecond))
		}

		t = time.Now()
		if lks, err := db.LoadLinks(); err != nil {
			log.Printf("warning: loading persisted links: %v", err)
		} else if len(lks) > 0 {
			links.Restore(lks)
			log.Printf("startup: restored %d link(s) in %s", len(lks), time.Since(t).Round(time.Millisecond))
		}

		t = time.Now()
		if imp, err := db.LoadImportedNodes(); err != nil {
			log.Printf("warning: loading imported nodes: %v", err)
		} else if len(imp) > 0 {
			imported.Replace(imp)
			log.Printf("startup: restored %d imported node(s) in %s", len(imp), time.Since(t).Round(time.Millisecond))
		}

		log.Printf("startup: db restore complete in %s", time.Since(bootStart).Round(time.Millisecond))
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Backfill each node's rolling latest-adverts list from the (large) history
	// table in the background, so the server starts serving immediately. Only
	// nodes that haven't yet heard a live advert are filled (see
	// AttachRecentAdverts), so this never clobbers freshly observed data.
	if db != nil && loadAdverts {
		go func() {
			t := time.Now()
			recent, err := db.LoadRecentAdverts(defaultAdvertsPerNode)
			if err != nil {
				log.Printf("warning: backfilling recent adverts: %v", err)
				return
			}
			registry.AttachRecentAdverts(recent)
			log.Printf("startup: backfilled recent adverts for %d node(s) in %s (background)", len(recent), time.Since(t).Round(time.Millisecond))
		}()
	}

	// One collector goroutine per analyzer.
	for _, ns := range store.Networks {
		for _, az := range ns.Analyzers {
			col, err := NewCollector(ns, az, registry, observers, links, metrics)
			if err != nil {
				log.Printf("[%s/%s] bad analyzer URL %q: %v", ns.ID, az.Name, az.URL, err)
				continue
			}
			go col.Run(ctx)
		}
	}

	// Mirror the external node directory (map.meshcore.io) on its own schedule
	// into a separate table/registry, kept apart from our live-observed nodes.
	if *importURL != "" {
		go newImporter(*importURL, *importEvery, imported, db).Run(ctx)
	}

	// Periodic sweep to keep dedup/observer maps bounded.
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				now := nowUnix()
				store.sweep(now, int64(dedupWindow.Seconds()), int64(observerTTL.Seconds()))
				links.sweep(now, int64(dedupWindow.Seconds()))
			}
		}
	}()

	// Periodically flush counters to SQLite, with a final flush on shutdown so
	// the latest state is captured before exit.
	if db != nil {
		go func() {
			ticker := time.NewTicker(*persistEvery)
			defer ticker.Stop()
			flush := func() {
				now := nowUnix()

				counters := store.Export()
				t := time.Now()
				err := db.Save(counters, now)
				metrics.observeDBFlush("counters", len(counters), time.Since(t), err)
				if err != nil {
					log.Printf("counter flush: %v", err)
				}

				nodes := registry.Export()
				t = time.Now()
				err = db.SaveNodes(nodes, now)
				metrics.observeDBFlush("nodes", len(nodes), time.Since(t), err)
				if err != nil {
					log.Printf("node flush: %v", err)
				}

				if pending := registry.PendingAdverts(); len(pending) > 0 {
					t = time.Now()
					err = db.AppendAdverts(pending)
					metrics.observeDBFlush("adverts", len(pending), time.Since(t), err)
					if err != nil {
						log.Printf("advert flush: %v", err)
					} else {
						registry.ClearPending(len(pending))
					}
				}
				if dirty := links.TakeDirty(); len(dirty) > 0 {
					t = time.Now()
					err = db.SaveLinks(dirty, now)
					metrics.observeDBFlush("links", len(dirty), time.Since(t), err)
					if err != nil {
						log.Printf("link flush: %v", err)
						links.Requeue(dirty) // retry next cycle
					}
				}
			}
			for {
				select {
				case <-ctx.Done():
					flush() // final flush captures the latest state before exit
					return
				case <-ticker.C:
					flush()
				}
			}
		}()

		// Observer activity flushes on its own (shorter) interval so the
		// "latest activity" table stays close to real time.
		go func() {
			ticker := time.NewTicker(*observerPersistEvery)
			defer ticker.Stop()
			flush := func() {
				obs := observers.Export()
				t := time.Now()
				err := db.SaveObservers(obs, nowUnix())
				metrics.observeDBFlush("observers", len(obs), time.Since(t), err)
				if err != nil {
					log.Printf("observer flush: %v", err)
				}
			}
			for {
				select {
				case <-ctx.Done():
					flush() // final flush before exit
					return
				case <-ticker.C:
					flush()
				}
			}
		}()
	}

	srv := &http.Server{
		Addr:         *addr,
		Handler:      NewServer(store, registry, observers, links, imported, metrics, *allowOrigin).Handler(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutCtx)
	}()

	log.Printf("listening on %s", *addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server: %v", err)
	}
	log.Print("shutdown complete")
}
