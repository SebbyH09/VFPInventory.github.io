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

    global.createFuzzyFilter = createFuzzyFilter;
})(window);
