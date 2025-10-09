---
title: Ontology API
---

# Ontology API

Retrieve and save persona ontologies and world state data in a format compatible with the frontend.

## Get Ontology

Retrieve all personas, their ontologies, and world state.

### Request

```
GET /api/ontology
```

### Response

**Status:** 200 OK

```json
{
  "personas": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Sports Scout",
      "role": "Professional Baseball Scout",
      "informationNeed": "Evaluate player performance and technique",
      "details": "Focus on batting mechanics and pitch recognition",
      "createdAt": "2025-10-06T14:30:00.000Z",
      "updatedAt": "2025-10-06T14:30:00.000Z"
    }
  ],
  "personaOntologies": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "personaId": "660e8400-e29b-41d4-a716-446655440001",
      "entities": [
        {
          "id": "entity-001",
          "name": "Pitcher",
          "definition": "Player who throws the ball to the batter",
          "wikidataId": "Q1196129"
        }
      ],
      "roles": [
        {
          "id": "role-001",
          "name": "Starting Pitcher",
          "definition": "Pitcher who begins the game"
        }
      ],
      "events": [
        {
          "id": "event-001",
          "name": "Pitch",
          "definition": "Act of throwing the ball toward home plate"
        }
      ],
      "relationTypes": [
        {
          "id": "relation-001",
          "name": "Throws",
          "definition": "Pitcher throws ball to batter",
          "sourceType": "entity",
          "targetType": "entity"
        }
      ],
      "relations": [],
      "createdAt": "2025-10-06T14:30:00.000Z",
      "updatedAt": "2025-10-06T14:30:00.000Z"
    }
  ],
  "world": {
    "entities": [
      {
        "id": "world-entity-001",
        "name": "Player 23",
        "type": "person",
        "description": "Team's starting pitcher",
        "wikidataId": null,
        "typeAssignments": [
          {
            "personaId": "660e8400-e29b-41d4-a716-446655440001",
            "typeId": "entity-001",
            "typeName": "Pitcher"
          }
        ]
      }
    ],
    "events": [],
    "times": [],
    "entityCollections": [],
    "eventCollections": [],
    "timeCollections": [],
    "relations": []
  }
}
```

### Response Schema

#### Persona Objects

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Persona identifier |
| name | string | Display name |
| role | string | Professional role |
| informationNeed | string | What persona wants to learn |
| details | string\|null | Additional context |
| createdAt | string | ISO 8601 timestamp |
| updatedAt | string | ISO 8601 timestamp |

#### Persona Ontology Objects

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Ontology identifier |
| personaId | UUID | Associated persona |
| entities | array | Entity type definitions |
| roles | array | Role type definitions |
| events | array | Event type definitions |
| relationTypes | array | Relation type definitions |
| relations | array | Relation instances (deprecated) |
| createdAt | string | ISO 8601 timestamp |
| updatedAt | string | ISO 8601 timestamp |

#### World State Object

| Field | Type | Description |
|-------|------|-------------|
| entities | array | Entity instances |
| events | array | Event instances |
| times | array | Time instances |
| entityCollections | array | Entity collection instances |
| eventCollections | array | Event collection instances |
| timeCollections | array | Time collection instances |
| relations | array | Relation instances |

### Example

```bash
curl http://localhost:3001/api/ontology
```

## Save Ontology

Save ontology data including personas, their ontologies, and world state. Uses upsert operations for atomic updates.

### Request

```
PUT /api/ontology
```

**Content-Type:** application/json

```json
{
  "personas": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Sports Scout",
      "role": "Professional Baseball Scout",
      "informationNeed": "Evaluate player performance and technique",
      "details": "Focus on batting mechanics and pitch recognition"
    }
  ],
  "personaOntologies": [
    {
      "personaId": "660e8400-e29b-41d4-a716-446655440001",
      "entities": [
        {
          "id": "entity-001",
          "name": "Pitcher",
          "definition": "Player who throws the ball to the batter",
          "wikidataId": "Q1196129"
        }
      ],
      "roles": [],
      "events": [],
      "relationTypes": []
    }
  ],
  "world": {
    "entities": [
      {
        "id": "world-entity-001",
        "name": "Player 23",
        "type": "person",
        "description": "Team's starting pitcher",
        "typeAssignments": [
          {
            "personaId": "660e8400-e29b-41d4-a716-446655440001",
            "typeId": "entity-001",
            "typeName": "Pitcher"
          }
        ]
      }
    ],
    "events": [],
    "times": [],
    "entityCollections": [],
    "eventCollections": [],
    "timeCollections": [],
    "relations": []
  }
}
```

### Request Body Schema

#### Required Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| personas | array | Yes | Array of persona objects |
| personaOntologies | array | Yes | Array of ontology objects |
| world | object | No | World state object |

#### Persona Object Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Persona UUID (for upsert) |
| name | string | Yes | Display name |
| role | string | Yes | Professional role |
| informationNeed | string | Yes | Information need |
| details | string | No | Additional details |

#### Persona Ontology Object Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| personaId | UUID | Yes | Associated persona UUID |
| entities | array | Yes | Entity type array (can be empty) |
| roles | array | Yes | Role type array (can be empty) |
| events | array | Yes | Event type array (can be empty) |
| relationTypes | array | Yes | Relation type array (can be empty) |

#### World State Object Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| entities | array | Yes | Entity instance array |
| events | array | Yes | Event instance array |
| times | array | Yes | Time instance array |
| entityCollections | array | Yes | Entity collection array |
| eventCollections | array | Yes | Event collection array |
| timeCollections | array | Yes | Time collection array |
| relations | array | Yes | Relation instance array |

### Response

**Status:** 200 OK

Returns the saved data in the same format as GET /api/ontology:

```json
{
  "personas": [...],
  "personaOntologies": [...],
  "world": {...}
}
```

### Example

```bash
curl -X PUT http://localhost:3001/api/ontology \
  -H "Content-Type: application/json" \
  -d '{
    "personas": [{
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Sports Scout",
      "role": "Professional Baseball Scout",
      "informationNeed": "Evaluate player performance"
    }],
    "personaOntologies": [{
      "personaId": "660e8400-e29b-41d4-a716-446655440001",
      "entities": [],
      "roles": [],
      "events": [],
      "relationTypes": []
    }]
  }'
```

## Notes

### Transaction Atomicity

All save operations execute within a database transaction. If any persona, ontology, or world state update fails, the entire operation is rolled back.

### Upsert Behavior

The endpoint uses upsert operations:
- If a persona with the given ID exists, it is updated
- If a persona does not exist, it is created
- Same behavior applies to ontologies and world state

### World State Singleton

There is only one WorldState record in the database. If world data is provided:
- Existing world state is updated
- If no world state exists, it is created
- World state is shared across all personas

### Ontology Structure

Each persona has exactly one ontology. The ontology contains:
- **Entity Types**: Categories of objects (person, car, building)
- **Role Types**: Roles objects can play (pitcher, driver)
- **Event Types**: Types of actions (pitch, drive, collision)
- **Relation Types**: Relationships between entities (contains, adjacent-to)

### Type Assignments

World entities can have type assignments from multiple personas:
```json
{
  "id": "world-entity-001",
  "name": "Person 1",
  "typeAssignments": [
    {
      "personaId": "persona-1",
      "typeId": "entity-001",
      "typeName": "Pitcher"
    },
    {
      "personaId": "persona-2",
      "typeId": "entity-042",
      "typeName": "Athlete"
    }
  ]
}
```

This allows different personas to interpret the same real-world object differently.

### Frontend Integration

This endpoint is designed to work with Redux state management:
- Frontend fetches all ontology data on application load
- Frontend sends complete state on save (not delta updates)
- Transaction ensures consistency between personas, ontologies, and world state

### Empty Arrays

Empty arrays are valid and indicate no types or instances of that category:
```json
{
  "entities": [],
  "roles": [],
  "events": [],
  "relationTypes": []
}
```

This creates a persona with an empty ontology, which can be populated later.
