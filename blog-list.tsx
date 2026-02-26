import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import { blogPosts } from '@/blog-data.ts';
import '@/legal.css';

interface BlogListProps {
  lang: Lang;
  t: Record<string, string>;
}

export const BlogListPage: React.FC<BlogListProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const lp = useLangPath();

  return (
    <div className="legal-page">
      <SEO title={t.seoBlogTitle} description={t.seoBlogDesc} path="/blog" lang={lang} />
      <div className="legal-content">
        <h1>{t.blogTitle}</h1>
        <p className="legal-intro">{t.blogIntro}</p>
        <div className="blog-list">
          {blogPosts.map(post => (
            <Link key={post.id} to={lp(`/blog/${post.id}`)} className="blog-card">
              <div className="blog-card-meta">
                <span className="blog-card-category">{t[`blogCat_${post.category}`] || post.category}</span>
                <time className="blog-card-date">{post.date}</time>
              </div>
              <h2>{t[post.titleKey]}</h2>
              <p>{t[post.descKey]}</p>
              <span className="blog-read-more">
                {t.blogReadMore}
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};
