export interface BlogPost {
  id: string;
  date: string;
  category: string;
  titleKey: string;
  descKey: string;
  contentKey: string;
}

export const blogPosts: BlogPost[] = [
  {
    id: 'pixel-art-beginner-tips',
    date: '2026-02-20',
    category: 'tutorial',
    titleKey: 'blog1Title',
    descKey: 'blog1Desc',
    contentKey: 'blog1Content',
  },
  {
    id: 'sprite-sheet-optimization',
    date: '2026-02-15',
    category: 'guide',
    titleKey: 'blog2Title',
    descKey: 'blog2Desc',
    contentKey: 'blog2Content',
  },
  {
    id: 'indie-game-character-design',
    date: '2026-02-10',
    category: 'tutorial',
    titleKey: 'blog3Title',
    descKey: 'blog3Desc',
    contentKey: 'blog3Content',
  },
  {
    id: 'color-theory-pixel-art',
    date: '2026-02-05',
    category: 'guide',
    titleKey: 'blog4Title',
    descKey: 'blog4Desc',
    contentKey: 'blog4Content',
  },
  {
    id: 'gif-to-sprite-workflow',
    date: '2026-01-28',
    category: 'workflow',
    titleKey: 'blog5Title',
    descKey: 'blog5Desc',
    contentKey: 'blog5Content',
  },
];
