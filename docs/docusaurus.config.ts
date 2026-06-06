import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'FOVEA Documentation',
  tagline: 'Flexible Ontology Visual Event Analyzer',
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
      {name: 'keywords', content: 'video annotation, object detection, tracking, ontology, personas, temporal model, bounding boxes, FOVEA, keyframe sequences, claim extraction, speaker diarization'},
      {name: 'description', content: 'FOVEA: Flexible Ontology Visual Event Analyzer. Author ontologies, annotate video, and extract grounded claims through persona-based interpretive lenses.'},
      {name: 'og:image', content: 'img/fovea-social-card.png'},
      {name: 'twitter:card', content: 'summary_large_image'},
    ],
    navbar: {
      title: 'FOVEA',
      logo: {
        alt: 'FOVEA Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          href: 'https://demo.fovea.video',
          position: 'left',
          label: 'Demo',
        },
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/reference/api',
          label: 'API Reference',
          position: 'left',
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
              label: 'Guides',
              to: '/docs/guide',
            },
            {
              label: 'Data model',
              to: '/docs/reference/data-model',
            },
            {
              label: 'API Reference',
              to: '/docs/reference/api',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'Concepts',
              to: '/docs/concepts',
            },
            {
              label: 'Contributing',
              to: '/docs/project/contributing',
            },
            {
              label: 'Changelog',
              to: '/docs/project/changelog',
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
