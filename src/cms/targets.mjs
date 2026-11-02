import { pages } from '../content.mjs';
export const siteTarget = '/_site';
export const isEditableTarget = path => path === siteTarget || Object.hasOwn(pages, path);
export const editableTargets = () => [{ path: siteTarget, title: 'Site-wide header, footer & logos' }, ...Object.entries(pages).map(([path, page]) => ({ path, title: path === '/' ? 'Home' : page.eyebrow || page.title }))];
