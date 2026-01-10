import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/manual-setup',
        'getting-started/first-video',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/architecture',
        'concepts/personas',
        'concepts/docker-profiles',
        'concepts/annotation-model',
        'concepts/temporal-model',
        'concepts/job-queues',
        'concepts/observability',
        'concepts/data-flow',
        'concepts/external-api-integration',
        'concepts/audio-processing',
      ],
    },
    {
      type: 'category',
      label: 'User Guides',
      collapsible: true,
      items: [
        {
          type: 'category',
          label: 'Authentication',
          items: [
            'user-guides/authentication/overview',
            'user-guides/authentication/managing-users',
            'user-guides/authentication/user-profile',
            'user-guides/authentication/sessions',
          ],
        },
        {
          type: 'category',
          label: 'Audio & Transcription',
          items: [
            'user-guides/audio/transcription-overview',
            'user-guides/audio/fusion-strategies',
          ],
        },
        'user-guides/external-apis',
        {
          type: 'category',
          label: 'Annotation',
          items: [
            'user-guides/annotation/creating-annotations',
            'user-guides/annotation/bounding-box-sequences',
            'user-guides/annotation/automated-tracking',
          ],
        },
        {
          type: 'category',
          label: 'Video Management',
          items: [
            'user-guides/video-management/s3-storage',
          ],
        },
        {
          type: 'category',
          label: 'Ontology',
          items: [
            'user-guides/ontology/type-suggestions',
          ],
        },
        {
          type: 'category',
          label: 'Claims',
          items: [
            'user-guides/claims/overview',
            'user-guides/claims/extraction',
            'user-guides/claims/editing',
            'user-guides/claims/relations',
          ],
        },
        {
          type: 'category',
          label: 'Data Management',
          items: [
            'user-guides/data-management/exporting-data',
            'user-guides/data-management/importing-data',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Model Service',
      items: [
        'model-service/overview',
        'model-service/configuration',
        'model-service/video-summarization',
        'model-service/object-detection',
        'model-service/video-tracking',
        'model-service/ontology-augmentation',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/overview',
        'deployment/prerequisites',
        'deployment/docker-quickstart',
        'deployment/cpu-mode',
        'deployment/gpu-mode',
        'deployment/build-modes',
        'deployment/configuration',
        'deployment/s3-configuration',
        'deployment/service-architecture',
      ],
    },
    {
      type: 'category',
      label: 'Local Wikibase',
      items: [
        'wikibase/overview',
        'wikibase/setup',
        'wikibase/data-loading',
        'wikibase/external-links',
        'wikibase/troubleshooting',
      ],
    },
    {
      type: 'category',
      label: 'Operations',
      items: [
        {
          type: 'category',
          label: 'Monitoring',
          items: ['operations/monitoring/overview'],
        },
        {
          type: 'category',
          label: 'Troubleshooting',
          items: ['operations/troubleshooting/common-issues'],
        },
      ],
    },
    {
      type: 'category',
      label: 'Development',
      items: [
        'development/contributing',
        'development/code-style',
        'development/testing',
        'development/frontend-dev',
        'development/backend-dev',
        'development/python-dev',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/docker-commands',
        'reference/environment-variables',
        'reference/service-ports',
        'reference/data-model',
        'reference/keyboard-shortcuts',
        'reference/glossary',
      ],
    },
  ],
  apiSidebar: [
    'api-reference/overview',
    'api-reference/authentication',
    'api-reference/personas',
    'api-reference/ontology',
    'api-reference/annotations',
    'api-reference/videos',
    'api-reference/claims',
    'api-reference/export-import',
    'api-reference/audio-transcription',
    {
      type: 'link',
      label: 'Frontend API',
      href: '/docs/api-reference/frontend/',
    },
    {
      type: 'link',
      label: 'Backend API',
      href: '/docs/api-reference/backend/',
    },
    {
      type: 'category',
      label: 'Model Service API',
      link: {
        type: 'doc',
        id: 'api-reference/model-service/routes',
      },
      items: [
        'api-reference/model-service/routes',
        'api-reference/model-service/models',
        'api-reference/model-service/llm_loader',
        'api-reference/model-service/vlm_loader',
        'api-reference/model-service/detection_loader',
        'api-reference/model-service/tracking_loader',
        'api-reference/model-service/summarization',
        'api-reference/model-service/claim_extraction',
        'api-reference/model-service/claim_synthesis',
        'api-reference/model-service/video_utils',
        'api-reference/model-service/model_manager',
      ],
    },
  ],
};

export default sidebars;
