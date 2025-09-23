# Video Annotation Ontology Development Tool

A web-based tool for developing annotation ontologies for video data, specifically designed for tactically-oriented analysts focusing on logistics and transportation events.

## Features

- **Video Browser**: Browse and search through available video data with metadata display
- **Ontology Builder**: Create and manage entities, roles, and events with a persona-based approach
- **Annotation Workspace**: Draw bounding boxes and create temporal annotations on videos
- **Gloss Editor**: Rich text definitions with type references for semantic relationships
- **JSON Schema Validation**: Ensures data integrity for exports
- **JSON Lines Export**: Export ontologies and annotations in a structured format

## Installation

### Prerequisites
- Node.js 18+ and npm
- Video files in MP4 format with accompanying metadata JSON files

### Setup

1. Install backend dependencies:
```bash
cd server
npm install
```

2. Install frontend dependencies:
```bash
cd annotation-tool
npm install
```

## Running the Application

1. Start the backend server (port 3001):
```bash
cd server
npm run dev
```

2. In a new terminal, start the frontend (port 3000):
```bash
cd annotation-tool
npm run dev
```

3. Open your browser and navigate to: http://localhost:3000

## Usage

### Video Browser
- View all available videos from the data directory
- Search by title, description, or tags
- Click "Annotate" to open a video in the annotation workspace

### Ontology Builder
1. Create a new ontology by defining a persona (role, information need, details)
2. Add entity types (e.g., "Container", "Truck", "Ship")
3. Define roles that can be filled by entities or events
4. Create event types with associated roles
5. Use the gloss editor to create rich definitions with type references

### Annotation Workspace
1. Open a video from the browser
2. Select an annotation mode (Entity, Role, or Event)
3. Draw bounding boxes on the video
4. Navigate frame-by-frame for precision
5. View current annotations in the sidebar

### Data Export
- Click "Export" to generate JSON Lines format
- Exports include the ontology, annotations, and video metadata
- All exports are validated against the JSON schema

## Data Format

The tool works with video files and metadata in the following format:
- Video files: `.mp4` format
- Metadata files: `.info.json` containing video information
- Both files should be in the `/data` directory

## Architecture

- **Frontend**: React + TypeScript + Material-UI + Redux
- **Backend**: Node.js + Express + TypeScript
- **Video Player**: video.js with custom annotation overlay
- **Validation**: AJV with JSON Schema
- **State Management**: Redux Toolkit

## Development

### TypeScript Compilation Check
```bash
cd annotation-tool
npx tsc --noEmit
```

### Backend TypeScript Compilation
```bash
cd server
npm run build
```

## Persona Example

The default persona is configured for:
- **Role**: Tactically-Oriented Analyst
- **Information Need**: Imports and exports of goods via ship, truck, or rail
- **Details**: Tracking arrival/departure of vehicles, container counts, types, and company logos