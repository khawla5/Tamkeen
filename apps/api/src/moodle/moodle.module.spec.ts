import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppConfigService } from '../config/app-config.module';
import { validateEnv } from '../config/env.schema';
import { LMS_PORT, type LmsPort } from './lms.port';
import { LmsUnavailableError } from './lms.types';
import { MockLmsService } from './mock/mock-lms.service';
import { MoodleModule } from './moodle.module';

/**
 * Checkpoint F: "callers depend only on the interface; the mock is swappable
 * without touching callers."
 *
 * `CatalogueReader` below stands in for real Phase 1/2 consumers. It injects
 * `LMS_PORT` and is written *once*; both tests below resolve it under a different
 * MOODLE_MODE. If swapping the implementation required editing this class, the
 * boundary would not hold — so the class being identical across both cases is
 * the assertion.
 */
@Injectable()
class CatalogueReader {
  constructor(@Inject(LMS_PORT) private readonly lms: LmsPort) {}

  async titles(): Promise<string[]> {
    const courses = await this.lms.listCourses();
    return courses.map((course) => course.title);
  }

  linkFor(lmsCourseId: number): string {
    return this.lms.courseUrl(lmsCourseId);
  }
}

async function buildWith(env: Record<string, string>) {
  const config = new AppConfigService(
    validateEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', ...env }),
  );

  /* MoodleModule imports AppConfigModule explicitly, so AppConfigService is in
     the graph and can be overridden with a per-test configuration. */
  return Test.createTestingModule({
    imports: [MoodleModule],
    providers: [CatalogueReader],
  })
    .overrideProvider(AppConfigService)
    .useValue(config)
    .compile();
}

describe('MoodleModule wiring', () => {
  describe('MOODLE_MODE=mock (the Phase 0 default)', () => {
    it('provides the mock behind LMS_PORT', async () => {
      const moduleRef = await buildWith({ MOODLE_MODE: 'mock' });

      expect(moduleRef.get<LmsPort>(LMS_PORT)).toBeInstanceOf(MockLmsService);
    });

    it('serves a caller that knows only the interface', async () => {
      const moduleRef = await buildWith({ MOODLE_MODE: 'mock' });
      const reader = moduleRef.get(CatalogueReader);

      const titles = await reader.titles();

      expect(titles.length).toBeGreaterThan(0);
      /* Arabic titles, because every consumer downstream is Arabic-first. */
      expect(titles[0]).toMatch(/[؀-ۿ]/);
    });
  });

  describe('MOODLE_MODE=real', () => {
    const realEnv = {
      MOODLE_MODE: 'real',
      MOODLE_BASE_URL: 'https://moodle.ministry.gov.example',
      MOODLE_WS_TOKEN: 'a-server-side-only-token',
      /* Short, so an unreachable host fails fast instead of holding the suite
         open for the production timeout. */
      MOODLE_TIMEOUT_MS: '50',
    };

    it('swaps the implementation without the caller changing', async () => {
      const moduleRef = await buildWith(realEnv);

      /* Same CatalogueReader class, resolved from a different implementation. */
      expect(moduleRef.get<LmsPort>(LMS_PORT)).not.toBeInstanceOf(MockLmsService);
      expect(moduleRef.get(CatalogueReader)).toBeInstanceOf(CatalogueReader);
    });

    it('fails loudly rather than pretending the catalogue is empty', async () => {
      const moduleRef = await buildWith(realEnv);
      const reader = moduleRef.get(CatalogueReader);

      /* Silently returning [] would look like a working integration with no
         courses — far worse than an explicit refusal.

         Before the adapter existed this threw NotImplementedException; now it
         reaches for an unreachable host and reports the LMS as down. The
         mechanism changed, the property under test did not: an unusable LMS
         must never present as an empty catalogue. */
      await expect(reader.titles()).rejects.toThrow(LmsUnavailableError);

      /* And specifically NOT an empty array, which is the failure this guards. */
      await expect(reader.titles()).rejects.not.toEqual([]);
    });

    it('still builds a course URL, since that needs no Moodle call', async () => {
      const moduleRef = await buildWith(realEnv);

      expect(moduleRef.get(CatalogueReader).linkFor(101)).toBe(
        'https://moodle.ministry.gov.example/course/view.php?id=101',
      );
    });

    it('never puts the web-services token in the course URL', async () => {
      const moduleRef = await buildWith(realEnv);

      /* The token is server-side only (§5.1); this value goes to a browser. */
      expect(moduleRef.get(CatalogueReader).linkFor(101)).not.toContain('a-server-side-only-token');
    });

    it('reports itself unhealthy instead of throwing, so a dashboard survives', async () => {
      const moduleRef = await buildWith(realEnv);
      const lms = moduleRef.get<LmsPort>(LMS_PORT);

      await expect(lms.checkHealth()).resolves.toMatchObject({ reachable: false });
    });
  });

  describe('configuration guard', () => {
    it('refuses MOODLE_MODE=real without a base URL', () => {
      expect(() => validateEnv({ MOODLE_MODE: 'real' })).toThrow(/MOODLE_BASE_URL/);
    });
  });
});
