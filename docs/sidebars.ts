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
        'concepts/observability',
        'concepts/data-flow',
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
            'user-guides/authentication/sessions',
          ],
        },
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
        'deployment/service-architecture',
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
    'api-reference/export-import',
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
      type: 'link',
      label: 'Model Service API',
      href: '/api-reference/model-service/index.html',
    },
  ],
};

export default sidebars;
