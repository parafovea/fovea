# Concepts

Why-oriented prose. Each page explains the model behind a feature
rather than how to use it.

- [Architecture](architecture.md): the three services, the queues
  between them, and what each layer adds.
- [Persona-scoped ontologies](persona-ontologies.md): why ontology
  is per-persona instead of per-project, and what that buys.
- [Annotation model](annotation-model.md): keyframes,
  interpolation, and the type / object distinction.
- [Claims model](claims-model.md): hierarchical claims, gloss
  items as typed pointers, and the synthesis path.
- [RBAC](rbac.md): the CASL framework, ownership columns,
  per-user ability cache, and `ownOnly` permission semantics.
- [Data isolation](data-isolation.md): how CASL gates list and
  mutation scope per requester.
- [Model service](model-service.md): the task-slot configuration,
  the loader hierarchy, and the external-API path.
- [Clean Architecture](clean-architecture.md): the model-service
  layout; domain, application, and infrastructure layers; ports
  versus adapters; the DI container.
