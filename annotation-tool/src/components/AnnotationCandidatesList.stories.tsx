/**
 * Storybook stories for AnnotationCandidatesList component.
 * Demonstrates detection UI with diverse scenarios including wildlife, sports, traffic, and retail.
 */

import type { Meta, StoryObj } from '@storybook/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { AnnotationCandidatesList } from './AnnotationCandidatesList'
import annotationReducer from '../store/annotationSlice'

/**
 * Create mock Redux store for stories.
 */
function createMockStore() {
  return configureStore({
    reducer: {
      annotations: annotationReducer,
    },
  })
}

/**
 * Wrapper component that provides Redux store.
 */
function StoryWrapper({ children }: { children: React.ReactNode }) {
  const store = createMockStore()
  return <Provider store={store}>{children}</Provider>
}

const meta: Meta<typeof AnnotationCandidatesList> = {
  title: 'Detection/AnnotationCandidatesList',
  component: AnnotationCandidatesList,
  decorators: [
    (Story) => (
      <StoryWrapper>
        <Story />
      </StoryWrapper>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof AnnotationCandidatesList>

/**
 * Wildlife documentary scenario.
 * Wildlife biologist tracking animal behavior in savanna ecosystem.
 */
export const WildlifeDocumentary: Story = {
  args: {
    videoId: 'wildlife-savanna-001',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: [
          {
            label: 'elephant',
            bounding_box: { x: 0.15, y: 0.25, width: 0.35, height: 0.45 },
            confidence: 0.94,
            track_id: 'elephant-1',
          },
          {
            label: 'zebra',
            bounding_box: { x: 0.6, y: 0.4, width: 0.2, height: 0.3 },
            confidence: 0.89,
            track_id: 'zebra-1',
          },
        ],
      },
      {
        frame_number: 30,
        timestamp: 1.0,
        detections: [
          {
            label: 'giraffe',
            bounding_box: { x: 0.25, y: 0.1, width: 0.2, height: 0.65 },
            confidence: 0.91,
            track_id: 'giraffe-1',
          },
          {
            label: 'lion',
            bounding_box: { x: 0.7, y: 0.55, width: 0.25, height: 0.35 },
            confidence: 0.87,
            track_id: 'lion-1',
          },
        ],
      },
      {
        frame_number: 60,
        timestamp: 2.0,
        detections: [
          {
            label: 'wildebeest',
            bounding_box: { x: 0.1, y: 0.5, width: 0.15, height: 0.25 },
            confidence: 0.78,
            track_id: 'wildebeest-1',
          },
        ],
      },
    ],
  },
}

/**
 * Sports broadcast scenario.
 * Sports analyst tracking player movements and ball possession in soccer match.
 */
export const SoccerMatch: Story = {
  args: {
    videoId: 'soccer-match-final-2024',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: [
          {
            label: 'player wearing red jersey number 10',
            bounding_box: { x: 0.3, y: 0.35, width: 0.12, height: 0.4 },
            confidence: 0.92,
            track_id: 'player-red-10',
          },
          {
            label: 'player wearing blue jersey',
            bounding_box: { x: 0.5, y: 0.4, width: 0.1, height: 0.38 },
            confidence: 0.88,
            track_id: 'player-blue-7',
          },
          {
            label: 'soccer ball',
            bounding_box: { x: 0.42, y: 0.58, width: 0.04, height: 0.04 },
            confidence: 0.96,
            track_id: 'ball-1',
          },
        ],
      },
      {
        frame_number: 15,
        timestamp: 0.5,
        detections: [
          {
            label: 'referee',
            bounding_box: { x: 0.65, y: 0.3, width: 0.08, height: 0.35 },
            confidence: 0.85,
            track_id: 'referee-1',
          },
          {
            label: 'goalkeeper',
            bounding_box: { x: 0.05, y: 0.4, width: 0.1, height: 0.38 },
            confidence: 0.91,
            track_id: 'goalkeeper-1',
          },
        ],
      },
    ],
    personaId: 'sports-analyst-1',
    typeId: 'player-entity-type',
    typeCategory: 'entity',
  },
}

/**
 * Traffic monitoring scenario.
 * Traffic engineer analyzing vehicle flow and pedestrian safety at intersection.
 */
export const TrafficIntersection: Story = {
  args: {
    videoId: 'traffic-intersection-rush-hour',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: [
          {
            label: 'sedan',
            bounding_box: { x: 0.1, y: 0.5, width: 0.25, height: 0.18 },
            confidence: 0.93,
            track_id: 'vehicle-001',
          },
          {
            label: 'delivery truck',
            bounding_box: { x: 0.55, y: 0.4, width: 0.35, height: 0.28 },
            confidence: 0.89,
            track_id: 'vehicle-002',
          },
          {
            label: 'cyclist',
            bounding_box: { x: 0.05, y: 0.6, width: 0.08, height: 0.2 },
            confidence: 0.82,
            track_id: 'cyclist-001',
          },
          {
            label: 'pedestrian crossing',
            bounding_box: { x: 0.75, y: 0.65, width: 0.06, height: 0.25 },
            confidence: 0.87,
            track_id: 'ped-001',
          },
        ],
      },
      {
        frame_number: 30,
        timestamp: 1.0,
        detections: [
          {
            label: 'bus',
            bounding_box: { x: 0.2, y: 0.35, width: 0.4, height: 0.32 },
            confidence: 0.95,
            track_id: 'vehicle-003',
          },
          {
            label: 'motorcycle',
            bounding_box: { x: 0.65, y: 0.55, width: 0.12, height: 0.15 },
            confidence: 0.76,
            track_id: 'vehicle-004',
          },
        ],
      },
    ],
    initialConfidenceThreshold: 0.7,
  },
}

/**
 * Retail inventory scenario.
 * Store manager tracking product placement and stock levels on shelves.
 */
export const RetailInventory: Story = {
  args: {
    videoId: 'grocery-aisle-3-morning',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: [
          {
            label: 'milk carton',
            bounding_box: { x: 0.15, y: 0.25, width: 0.08, height: 0.15 },
            confidence: 0.86,
            track_id: null,
          },
          {
            label: 'bread loaf',
            bounding_box: { x: 0.35, y: 0.3, width: 0.12, height: 0.1 },
            confidence: 0.79,
            track_id: null,
          },
          {
            label: 'cereal box',
            bounding_box: { x: 0.55, y: 0.2, width: 0.1, height: 0.18 },
            confidence: 0.91,
            track_id: null,
          },
          {
            label: 'shopping cart',
            bounding_box: { x: 0.75, y: 0.5, width: 0.2, height: 0.35 },
            confidence: 0.94,
            track_id: 'cart-001',
          },
        ],
      },
      {
        frame_number: 60,
        timestamp: 2.0,
        detections: [
          {
            label: 'customer with basket',
            bounding_box: { x: 0.4, y: 0.35, width: 0.15, height: 0.45 },
            confidence: 0.88,
            track_id: 'customer-001',
          },
          {
            label: 'employee restocking',
            bounding_box: { x: 0.1, y: 0.3, width: 0.12, height: 0.5 },
            confidence: 0.83,
            track_id: 'employee-001',
          },
        ],
      },
    ],
    personaId: 'store-manager-1',
    typeId: 'product-entity-type',
    typeCategory: 'entity',
  },
}

/**
 * Manufacturing quality control scenario.
 * QA inspector detecting defects on assembly line production.
 */
export const ManufacturingQC: Story = {
  args: {
    videoId: 'assembly-line-station-5',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: [
          {
            label: 'component with scratch defect',
            bounding_box: { x: 0.3, y: 0.4, width: 0.15, height: 0.12 },
            confidence: 0.72,
            track_id: 'part-001',
          },
          {
            label: 'properly assembled unit',
            bounding_box: { x: 0.55, y: 0.45, width: 0.18, height: 0.15 },
            confidence: 0.89,
            track_id: 'part-002',
          },
          {
            label: 'robotic arm',
            bounding_box: { x: 0.1, y: 0.2, width: 0.2, height: 0.4 },
            confidence: 0.95,
            track_id: 'robot-1',
          },
        ],
      },
    ],
    initialConfidenceThreshold: 0.6,
  },
}

/**
 * Construction site safety scenario.
 * Safety officer monitoring PPE compliance and hazardous situations.
 */
export const ConstructionSafety: Story = {
  args: {
    videoId: 'construction-site-entrance',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: [
          {
            label: 'worker wearing hard hat',
            bounding_box: { x: 0.2, y: 0.3, width: 0.12, height: 0.35 },
            confidence: 0.91,
            track_id: 'worker-001',
          },
          {
            label: 'worker without safety vest',
            bounding_box: { x: 0.5, y: 0.35, width: 0.1, height: 0.32 },
            confidence: 0.68,
            track_id: 'worker-002',
          },
          {
            label: 'construction equipment',
            bounding_box: { x: 0.7, y: 0.4, width: 0.25, height: 0.45 },
            confidence: 0.93,
            track_id: 'equipment-001',
          },
        ],
      },
    ],
    personaId: 'safety-officer-1',
    typeId: 'ppe-violation-type',
    typeCategory: 'event',
  },
}

/**
 * Low confidence detections scenario.
 * Demonstrates filtering of uncertain detections.
 */
export const LowConfidenceDetections: Story = {
  args: {
    videoId: 'challenging-conditions',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: [
          {
            label: 'partially occluded vehicle',
            bounding_box: { x: 0.1, y: 0.5, width: 0.15, height: 0.2 },
            confidence: 0.42,
            track_id: null,
          },
          {
            label: 'distant person',
            bounding_box: { x: 0.7, y: 0.3, width: 0.05, height: 0.12 },
            confidence: 0.35,
            track_id: null,
          },
          {
            label: 'clear object',
            bounding_box: { x: 0.4, y: 0.4, width: 0.2, height: 0.25 },
            confidence: 0.88,
            track_id: 'obj-001',
          },
        ],
      },
    ],
    initialConfidenceThreshold: 0.3,
  },
}

/**
 * Empty results scenario.
 * No detections found in the video.
 */
export const NoDetections: Story = {
  args: {
    videoId: 'empty-scene',
    frames: [],
  },
}

/**
 * High volume scenario.
 * Many detections requiring batch operations.
 */
export const HighVolumeDetections: Story = {
  args: {
    videoId: 'crowded-scene',
    frames: [
      {
        frame_number: 0,
        timestamp: 0.0,
        detections: Array.from({ length: 12 }, (_, i) => ({
          label: `object-${i + 1}`,
          bounding_box: {
            x: (i % 4) * 0.25,
            y: Math.floor(i / 4) * 0.3,
            width: 0.2,
            height: 0.25,
          },
          confidence: 0.7 + Math.random() * 0.25,
          track_id: `track-${i + 1}`,
        })),
      },
    ],
    initialConfidenceThreshold: 0.7,
  },
}
