// fuzzySearch.js
// Shared fuzzy-search helper built on Fuse.js (loaded separately via CDN).
// It provides typo-tolerant matching while preserving the existing
// show/hide filter behaviour used across the app's search boxes.
//
// If Fuse.js fails to load for any reason, this degrades gracefully to plain
// substring matching, so search keeps working exactly as it did before.
(function (global) {
    'use strict';

    // Fuse threshold: 0.0 = exact match only, 1.0 = match anything.
    // 0.4 tolerates typical typos (a wrong or missing letter or two) without
    // flooding the results with loose matches.
    var DEFAULT_THRESHOLD = 0.4;

    function normalize(value) {
        return (value == null ? '' : String(value)).toLowerCase().trim();
    }

    // Build a reusable matcher over a fixed set of records.
    //   records: array of { key, text }  — key is any unique identifier,
    //            text is the searchable string for that record.
    //   options.threshold: optional Fuse threshold override.
    //   returns: function(query) -> Set of keys whose text matches `query`.
    //
    // An empty query matches every record. Exact substring matches are always
    // included, so enabling fuzzy matching only ever adds tolerance — it never
    // hides a result the old substring search would have shown.
    function createFuzzyFilter(records, options) {
        var list = (records || []).map(function (r) {
            return { key: r.key, text: normalize(r.text) };
        });
        var threshold = (options && typeof options.threshold === 'number')
            ? options.threshold
            : DEFAULT_THRESHOLD;

        var fuse = (typeof global.Fuse === 'function')
            ? new global.Fuse(list, {
                keys: ['text'],
                threshold: threshold,
                ignoreLocation: true,   // match anywhere in the string
                minMatchCharLength: 1
            })
            : null;

        return function matches(query) {
            var q = normalize(query);
            var result = new Set();
            if (q === '') {
                list.forEach(function (r) { result.add(r.key); });
                return result;
            }
            // Substring hits always count (keeps obvious matches obvious).
            list.forEach(function (r) {
                if (r.text.indexOf(q) !== -1) result.add(r.key);
            });
            // Fuzzy hits add typo tolerance on top.
            if (fuse) {
                fuse.search(q).forEach(function (hit) { result.add(hit.item.key); });
            }
            return result;
        };
    }

    // Build a reusable *ranked* matcher over a fixed set of records.
    // Same inputs as createFuzzyFilter, but the returned function reports
    // matches best-first so callers can reorder results by relevance.
    //   returns: function(query) -> null for an empty query (meaning "no
    //            ranking; show everything in original order"), otherwise
    //            { order: [keys best-first], set: Set(matching keys) }.
    //
    // Ranking: exact substring hits rank ahead of fuzzy-only hits; among
    // substring hits, an earlier match position wins; among fuzzy hits, the
    // lower Fuse score (closer match) wins.
    function createRankedFuzzyFilter(records, options) {
        var list = (records || []).map(function (r) {
            return { key: r.key, text: normalize(r.text) };
        });
        var threshold = (options && typeof options.threshold === 'number')
            ? options.threshold
            : DEFAULT_THRESHOLD;

        var fuse = (typeof global.Fuse === 'function')
            ? new global.Fuse(list, {
                keys: ['text'],
                threshold: threshold,
                ignoreLocation: true,
                minMatchCharLength: 1,
                includeScore: true
            })
            : null;

        return function search(query) {
            var q = normalize(query);
            if (q === '') return null;

            var ranked = [];
            var seen = new Set();

            // Substring hits first, scored below zero so they always outrank
            // fuzzy-only hits; earlier match position ranks higher.
            list.forEach(function (r) {
                var pos = r.text.indexOf(q);
                if (pos !== -1) {
                    ranked.push({ key: r.key, score: -1 + Math.min(pos, 9999) / 10000 });
                    seen.add(r.key);
                }
            });

            // Fuzzy hits fill in the typo-tolerant matches, by Fuse score.
            if (fuse) {
                fuse.search(q).forEach(function (hit) {
                    if (!seen.has(hit.item.key)) {
                        ranked.push({ key: hit.item.key, score: hit.score });
                        seen.add(hit.item.key);
                    }
                });
            }

            ranked.sort(function (a, b) { return a.score - b.score; });
            return {
                order: ranked.map(function (x) { return x.key; }),
                set: seen
            };
        };
    }

    global.createFuzzyFilter = createFuzzyFilter;
    global.createRankedFuzzyFilter = createRankedFuzzyFilter;
})(window);
