export const galleryCategories = ['Wealth', 'KV Constructions', 'Real Estate', 'Rudraksh', 'Brindavan Resto'];
export const initialGallery = [
  { id: 'architecture', title: 'A perspective on possibility', category: 'Wealth', src: '/assets/architecture.jpg', alt: 'Illustrative contemporary corporate architecture', caption: 'Architecture as inspiration for strong foundations.', illustrative: true },
  { id: 'engineering', title: 'The discipline behind a structure', category: 'KV Constructions', src: '/assets/construction.jpg', alt: 'Illustrative construction and engineering activity', caption: 'An independent construction collaboration. This image does not represent a verified KV project.', illustrative: true },
  { id: 'residential', title: 'Spaces with a considered purpose', category: 'Real Estate', src: '/assets/residence.jpg', alt: 'Illustrative contemporary residential architecture', caption: 'A visual perspective on residential design, not a property listing or completed project.', illustrative: true },
  { id: 'materials', title: 'From foundation to finish', category: 'Rudraksh', src: '/assets/materials.svg', alt: 'Conceptual display of cement, tiles, reinforcement and plumbing products', caption: 'A conceptual retail materials display. Confirm specifications and availability directly.', illustrative: true },
  { id: 'hospitality', title: 'A place for shared moments', category: 'Brindavan Resto', src: '/assets/dining.jpg', alt: 'Illustrative restaurant interior with welcoming dining spaces', caption: 'Hospitality inspiration, not a photograph of a verified Brindavan Resto facility.', illustrative: true },
];
export const samplePortraits = [1, 2, 3].map(number => `/assets/sample-portraits/portrait-0${number}.png`);
export const initialTeam = samplePortraits.map((src, index) => ({
  id: `sample-team-${index + 1}`, name: `Team Member Name ${String(index + 1).padStart(2, '0')}`,
  role: ['Leadership / Designation', 'Business / Designation', 'Operations / Designation'][index],
  business: 'Business / Department',
  bio: 'Add a short introduction about this team member, their responsibilities, relevant experience and the way they support your customers.',
  src, alt: 'AI-generated sample portrait. Replace with the team member’s approved photograph.', sample: true, consent: false, approved: false,
}));
export const initialTestimonials = samplePortraits.map((src, index) => ({
  id: `sample-testimonial-${index + 1}`, name: ['Customer Name', 'Partner Name', 'Guest Name'][index],
  role: 'Designation / Relationship', business: ['Kalpavruksha Wealth', 'Real Estate & Developers', 'Brindavan Resto'][index],
  quote: [
    'Replace this sample text with the customer’s approved feedback about their experience, the conversation they had and what mattered to them.',
    'Add a genuine testimonial here. Describe the person’s own experience in their words, then update their name, details and photograph.',
    'Use this space for an authentic guest experience. Replace this text and the sample portrait with content shared with permission.',
  ][index],
  src, alt: 'AI-generated sample portrait. Replace with the reviewer’s approved photograph.', sample: true, consent: false, approved: false,
}));
export const initialCollections = { gallery: initialGallery, testimonials: initialTestimonials, team: initialTeam };
