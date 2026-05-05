import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Video Annotation Tool"
      description="Video annotation tool for building ontologies with persona-based approaches, keyframe sequences, and AI-powered tracking.">
      <main className={styles.page}>
        <div className={styles.content}>
          <img className={styles.mark} src="/img/logo.svg" alt="Fovea" />

          <h1 className={styles.title}>Fovea</h1>
          <p className={styles.subtitle}>
            Video annotation for teams that need more than bounding boxes.
          </p>
          <p className={styles.description}>
            Build structured ontologies, annotate with multiple analyst perspectives,
            and ground your labels in shared semantics. Open source.
          </p>

          <nav className={styles.links}>
            <Link className={styles.linkPrimary} href="https://demo.fovea.video">
              Try the demo
            </Link>
            <Link className={styles.link} to="/docs">
              Documentation
            </Link>
            <Link className={styles.link} to="/docs/guide">
              Get started
            </Link>
            <Link className={styles.link} href="https://github.com/parafovea/fovea">
              GitHub
            </Link>
          </nav>
        </div>

      </main>
    </Layout>
  );
}
