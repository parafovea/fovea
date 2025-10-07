import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Fovea Documentation',
  tagline: 'Web-based video annotation tool for developing annotation ontologies',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://fovea.video',
  baseUrl: '/',

  organizationName: 'parafovea',
  projectName: 'fovea',

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en'],
        indexBlog: false,
        indexDocs: true,
        indexPages: true,
        docsRouteBasePath: '/docs',
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
        searchResultContextMaxLength: 50,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/fovea-social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    metadata: [
      {name: 'keywords', content: 'video annotation, object detection, tracking, ontology, personas, temporal model, bounding boxes, fovea, keyframe sequences, ai-powered analysis'},
      {name: 'description', content: 'FOVEA is a web-based video annotation tool for developing annotation ontologies with persona-based approaches, keyframe sequences, and AI-powered analysis.'},
      {name: 'og:image', content: 'img/fovea-social-card.png'},
      {name: 'twitter:card', content: 'summary_large_image'},
    ],
    navbar: {
      title: 'Fovea',
      logo: {
        alt: 'Fovea Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'dropdown',
          label: 'API Reference',
          position: 'left',
          items: [
            {
              label: 'Overview',
              to: '/docs/api-reference/overview',
            },
            {
              label: 'Frontend API',
              to: '/docs/api-reference/frontend/',
            },
            {
              label: 'Backend API',
              to: '/docs/api-reference/backend/',
            },
            {
              label: 'Model Service API',
              href: '/api-reference/model-service/index.html',
            },
          ],
        },
        {
          href: 'https://github.com/parafovea/fovea',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/installation',
            },
            {
              label: 'Deployment',
              to: '/docs/deployment/overview',
            },
            {
              label: 'API Reference',
              to: '/docs/api-reference/overview',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'User Guides',
              to: '/docs/user-guides/annotation/creating-annotations',
            },
            {
              label: 'Development',
              to: '/docs/development/contributing',
            },
            {
              label: 'Reference',
              to: '/docs/reference/docker-commands',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/parafovea/fovea',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Fovea Project. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
