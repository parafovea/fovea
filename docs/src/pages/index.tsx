import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>FOVEA</h1>
          <p className={styles.heroSubtitle}>
            Flexible Ontology Visual Event Analyzer
          </p>
          <p className={styles.heroDescription}>
            A web-based video annotation tool for developing annotation ontologies
            with persona-based approaches, keyframe sequences, and AI-powered analysis
          </p>
          <div className={styles.buttons}>
            <Link
              className={clsx('button button--primary button--lg', styles.primaryButton)}
              to="/docs/getting-started/installation">
              Get Started
            </Link>
            <Link
              className={clsx('button button--secondary button--lg', styles.secondaryButton)}
              to="/docs">
              Documentation
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function Feature({title, icon, description}) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className={styles.featureIcon}>{icon}</div>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDescription}>{description}</p>
    </div>
  );
}

function FeatureSection() {
  const features = [
    {
      title: 'Persona-Based Ontologies',
      icon: '👥',
      description: 'Multiple analysts can annotate the same video with different perspectives and ontologies. Each persona maintains their own interpretive framework.',
    },
    {
      title: 'Temporal Sequences',
      icon: '🎬',
      description: 'Keyframe-based bounding box sequences with automatic interpolation. Support for linear, bezier, and custom easing functions.',
    },
    {
      title: 'AI-Powered Analysis',
      icon: '🤖',
      description: 'Integrated video summarization, object detection, and automated tracking with state-of-the-art vision models.',
    },
    {
      title: 'Flexible Deployment',
      icon: '⚙️',
      description: 'Run on CPU or GPU, locally or in production. Docker-based deployment with support for NVIDIA GPUs.',
    },
    {
      title: 'Rich Temporal Model',
      icon: '⏱️',
      description: 'Represent vague time, deictic references, and complex temporal relationships across multiple videos.',
    },
    {
      title: 'Import & Export',
      icon: '📦',
      description: 'Full data portability with JSON Lines format. Import with intelligent conflict resolution and validation.',
    },
  ];

  return (
    <section className={styles.featuresSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Key Features</h2>
        <div className="row">
          {features.map((feature, idx) => (
            <Feature key={idx} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function UseCaseSection() {
  return (
    <section className={styles.useCaseSection}>
      <div className="container">
        <div className="row">
          <div className="col col--6">
            <h2 className={styles.sectionTitle}>For Every Domain</h2>
            <p className={styles.useCaseDescription}>
              FOVEA is a general-purpose video annotation tool used across diverse
              domains. Develop specialized ontologies tailored to your specific
              needs, from wildlife research to sports analytics.
            </p>
            <ul className={styles.useCaseList}>
              <li>Sports analytics and performance tracking</li>
              <li>Wildlife research and behavioral studies</li>
              <li>Medical procedure review and training</li>
              <li>Retail analytics and customer behavior</li>
              <li>Film production and continuity tracking</li>
              <li>Urban planning and traffic analysis</li>
            </ul>
          </div>
          <div className="col col--6">
            <div className={styles.codeBlock}>
              <h3>Annotation Workflow</h3>
              <ol className={styles.workflowSteps}>
                <li>Define your ontology with entity and event types</li>
                <li>Load video and create initial bounding box</li>
                <li>Add keyframes to track object movement</li>
                <li>Choose interpolation mode (linear, bezier, ease-in-out)</li>
                <li>Use AI tracking to accelerate annotation</li>
                <li>Export annotations with full temporal sequences</li>
              </ol>
              <div className={styles.workflowNote}>
                <strong>Keyframe Interpolation:</strong> Draw boxes at key positions,
                FOVEA automatically generates intermediate frames with smooth motion.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className={styles.ctaSection}>
      <div className="container">
        <h2 className={styles.ctaTitle}>Ready to start annotating?</h2>
        <p className={styles.ctaDescription}>
          Get FOVEA running with Docker in less than 5 minutes
        </p>
        <div className={styles.buttons}>
          <Link
            className={clsx('button button--primary button--lg', styles.ctaButton)}
            to="/docs/getting-started/installation">
            Get Started Now
          </Link>
          <Link
            className={clsx('button button--secondary button--lg', styles.ctaButton)}
            href="https://github.com/parafovea/fovea">
            View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Video Annotation Tool"
      description="Web-based video annotation tool for developing annotation ontologies with persona-based approaches, keyframe sequences, and AI-powered analysis">
      <HomepageHeader />
      <main>
        <FeatureSection />
        <UseCaseSection />
        <CTASection />
      </main>
    </Layout>
  );
}
