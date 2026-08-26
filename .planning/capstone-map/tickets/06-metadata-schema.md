---
id: 06
title: What is the image metadata schema the vision model must return?
label: wayfinder:grilling
hitl: true
status: open
assignee:
blocked-by: ["02"]
blocks: ["08", "09"]
---

## Question

Every vision response must satisfy one Zod-validated JSON shape. The brief's example (`subject`, `category`, `attributes[]`, `caption`, `confidence`) is a starting point, not a contract.

Fix precisely: the category enum (must carry the categories the guard will check), attribute format and cardinality, caption constraints (it gets embedded — length/shape matters), the confidence floor below which a result is flagged rather than accepted, and the failure path when validation fails (retry vs flag vs quarantine — never silently accept).
