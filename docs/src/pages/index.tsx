import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

export default function Home(): JSX.Element {
  return (
    <Layout
      title="FOVEA"
      description="FOVEA: Flexible Ontology Visual Event Analyzer. Author ontologies, annotate video, and extract grounded claims through persona-based interpretive lenses.">
      <main className={styles.page}>
        <div className={styles.content}>
          <img className={styles.mark} src="/img/logo.svg" alt="FOVEA" />

          <h1 className={styles.title}>FOVEA</h1>
          <p className={styles.subtitle}>
            Flexible Ontology Visual Event Analyzer
          </p>
          <p className={styles.description}>
            Author ontologies, annotate video, and extract grounded claims through
            persona-based interpretive lenses. Open source.
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
