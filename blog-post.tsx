import React, { useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import { blogPosts } from '@/blog-data.ts';
import '@/legal.css';

interface BlogPostProps {
  lang: Lang;
  t: Record<string, string>;
}

export const BlogPostPage: React.FC<BlogPostProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const { slug } = useParams<{ slug: string }>();
  const lp = useLangPath();
  const post = blogPosts.find(p => p.id === slug);

  if (!post) return <Navigate to={lp('/blog')} replace />;

  const content = t[post.contentKey] || '';
  const paragraphs = content.split('\n\n');

  return (
    <div className="legal-page">
      <SEO title={t[post.titleKey]} description={t[post.descKey]} path={`/blog/${post.id}`} lang={lang} />
      <div className="legal-content blog-post-content">
        <nav className="blog-breadcrumb">
          <Link to={lp('/blog')}>{t.blogTitle}</Link>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
          <span>{t[post.titleKey]}</span>
        </nav>
        <div className="blog-post-meta">
          <span className="blog-card-category">{t[`blogCat_${post.category}`] || post.category}</span>
          <time>{post.date}</time>
        </div>
        <h1>{t[post.titleKey]}</h1>
        <div className="blog-post-body">
          {paragraphs.map((p, i) => {
            if (p.startsWith('## ')) return <h2 key={i}>{p.replace('## ', '')}</h2>;
            if (p.startsWith('### ')) return <h3 key={i}>{p.replace('### ', '')}</h3>;
            return <p key={i}>{p}</p>;
          })}
        </div>
        <div className="guide-bottom-cta">
          <p>{t.blogCtaText}</p>
          <Link to={lp('/editor')} className="guide-cta-button">{t.blogCtaButton}</Link>
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};
