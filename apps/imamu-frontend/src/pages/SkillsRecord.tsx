import CVBuilder from './CVBuilder'

// The skills record uses the shared CV builder workspace. The builder owns the
// IMSIU hero, smart-sync banner, editor, preview, AI review, and export flow so
// /skills-record and /cv-builder stay visually and behaviorally consistent.
export default function SkillsRecord() {
  return <CVBuilder />
}
