const fs = require('fs');

const SITE_URL = 'https://nodefeeds.com/';
const SITE_NAME = 'NodeFeeds';
const db = { getCategories: () => [], getMostViewed: () => [], getArticles: () => [] };
function adsenseHead() { return ''; }

function layout(title, body, meta = {}) {
  const { description, image } = meta;
  const desc = description || 'AI & Tech Intelligence, Delivered Fresh';
  const currentPath = meta.path || '';
  
  const baseSiteUrl = SITE_URL.endsWith('/') ? SITE_URL.slice(0, -1) : SITE_URL;
  let fullImgUrl = `${baseSiteUrl}/og-image.png`;
  if (image) {
    fullImgUrl = image.startsWith('http') ? image : `${baseSiteUrl}${image.startsWith('/') ? '' : '/'}${image}`;
  }

  const isArticle = currentPath.startsWith('/article/');
  const canonicalUrl = `${baseSiteUrl}${currentPath}`;

  return `
Path: ${currentPath}
isArticle: ${isArticle}
og:type: ${isArticle ? 'article' : 'website'}
og:image: ${fullImgUrl}
canonical: ${canonicalUrl}
`;
}

console.log("--- Homepage Test ---");
console.log(layout('Home', '', { path: '/' }));

console.log("--- Article Test ---");
console.log(layout('Story', '', { path: '/article/test' }));
