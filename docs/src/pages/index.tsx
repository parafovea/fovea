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
            Build video annotation ontologies that capture how different analysts
            interpret the same events. Multiple perspectives, shared reality, semantic grounding.
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
      title: 'Types vs. Instances',
      icon: '🔗',
      description: 'Separate analyst interpretations (EntityType, EventType) from shared world objects (Entity, Event). Different analysts assign different types to the same real-world objects.',
    },
    {
      title: 'Persona-Based Ontologies',
      icon: '👥',
      description: 'Each analyst maintains their own ontology with distinct entity types, event types, and role definitions. Capture tactical, operational, and strategic perspectives on the same video.',
    },
    {
      title: 'Semantic Grounding',
      icon: '🌐',
      description: 'Link types to Wikidata entities for semantic interoperability. Import definitions, GPS coordinates, and temporal data directly from external knowledge bases.',
    },
    {
      title: 'Collections & Relations',
      icon: '🔀',
      description: 'Group entities and events into semantic collections. Define custom relation types to capture organizational hierarchies, causal links, and temporal patterns.',
    },
    {
      title: 'Rich Temporal Model',
      icon: '⏱️',
      description: 'Express vague time (early morning, late 2024), deictic references (yesterday, next week), cyclical patterns, and temporal relationships across multiple videos.',
    },
    {
      title: 'Advanced Keyframes',
      icon: '🎬',
      description: 'Keyframe-based annotation with linear, bezier, ease-in-out interpolation. Toggle visibility for occlusion handling. AI-powered tracking acceleration.',
    },
  ];

  return (
    <section className={styles.featuresSection}>
      <div className="container">
        <h2 className={styles.sectionTitle}>What Makes FOVEA Different</h2>
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
            <h2 className={styles.sectionTitle}>When Different Perspectives Matter</h2>
            <p className={styles.useCaseDescription}>
              FOVEA is designed for situations where multiple analysts need to
              interpret the same video footage through different analytical lenses,
              while maintaining a shared understanding of underlying reality.
            </p>
            <ul className={styles.useCaseList}>
              <li>Intelligence analysis with tactical, operational, and strategic viewpoints</li>
              <li>Disaster response coordination across emergency services and NGOs</li>
              <li>Clinical research where radiologists and specialists interpret the same scans</li>
              <li>Legal proceedings with prosecution, defense, and expert witness perspectives</li>
              <li>Ecological monitoring where biologists track different interaction types</li>
              <li>Ethnographic research capturing participant and observer interpretations</li>
            </ul>
          </div>
          <div className="col col--6">
            <div className={styles.codeBlock}>
              <h3>Core Concepts</h3>
              <ol className={styles.workflowSteps}>
                <li>Create personas representing different analytical roles</li>
                <li>Build persona-specific ontologies with entity and event types</li>
                <li>Annotate video linking regions to types OR shared world objects</li>
                <li>Ground types semantically using Wikidata references</li>
                <li>Define collections and relations to capture structure</li>
                <li>Export with conflict resolution for collaborative workflows</li>
              </ol>
              <div className={styles.workflowNote}>
                <strong>Example:</strong> A disaster analyst sees "Infrastructure Damage" while a
                humanitarian sees "Shelter Need" on the same collapsed building instance.
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
        <h2 className={styles.ctaTitle}>Build ontologies that capture how analysts think</h2>
        <p className={styles.ctaDescription}>
          Open source, Docker-based deployment, runs on CPU or GPU
        </p>
        <div className={styles.buttons}>
          <Link
            className={clsx('button button--primary button--lg', styles.ctaButton)}
            to="/docs/getting-started/installation">
            Get Started
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
