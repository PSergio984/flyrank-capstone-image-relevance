# Graph Report - flyrank-capstone-image-relevance  (2026-08-26)

## Corpus Check
- 13 files · ~3,659 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 16 nodes · 15 edges · 4 communities (3 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0cc7a4a2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Research: Gemini APIs — image understanding, structured output, embeddings
- (a) Image understanding
- (b) Structured output
- (d) Free-tier rate limits

## God Nodes (most connected - your core abstractions)
1. `Research: Gemini APIs — image understanding, structured output, embeddings` - 7 edges
2. `(a) Image understanding` - 5 edges
3. `(b) Structured output` - 4 edges
4. `(d) Free-tier rate limits` - 2 edges
5. `SDK and API surface` - 1 edges
6. `Model names` - 1 edges
7. `Sending images: inline vs Files API` - 1 edges
8. `Formats and limits` - 1 edges
9. `Mechanism` - 1 edges
10. `Supported schema subset` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (4 total, 1 thin omitted)

### Community 0 - "Research: Gemini APIs — image understanding, structured output, embeddings"
Cohesion: 0.40
Nodes (4): (c) Embeddings, Could not answer from official docs, Gotchas that affect our design decisions, Research: Gemini APIs — image understanding, structured output, embeddings

### Community 1 - "(a) Image understanding"
Cohesion: 0.40
Nodes (5): (a) Image understanding, Formats and limits, Model names, SDK and API surface, Sending images: inline vs Files API

### Community 2 - "(b) Structured output"
Cohesion: 0.50
Nodes (4): (b) Structured output, Failures / refusals, Mechanism, Supported schema subset

## Knowledge Gaps
- **11 isolated node(s):** `SDK and API surface`, `Model names`, `Sending images: inline vs Files API`, `Formats and limits`, `Mechanism` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Research: Gemini APIs — image understanding, structured output, embeddings` connect `Research: Gemini APIs — image understanding, structured output, embeddings` to `(a) Image understanding`, `(b) Structured output`, `(d) Free-tier rate limits`?**
  _High betweenness centrality (0.838) - this node is a cross-community bridge._
- **Why does `(a) Image understanding` connect `(a) Image understanding` to `Research: Gemini APIs — image understanding, structured output, embeddings`?**
  _High betweenness centrality (0.476) - this node is a cross-community bridge._
- **Why does `(b) Structured output` connect `(b) Structured output` to `Research: Gemini APIs — image understanding, structured output, embeddings`?**
  _High betweenness centrality (0.371) - this node is a cross-community bridge._
- **What connects `SDK and API surface`, `Model names`, `Sending images: inline vs Files API` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._