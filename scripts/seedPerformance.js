/**
 * Performance module — Phase 0 setup (idempotent, safe on production).
 *
 * The 5 firm behaviours and the 1–5 rating descriptions are fixed CODE constants
 * (utils/performanceEnums.js), seeded into each review at creation time — there is
 * NO separate editable collection to populate. So this script only:
 *   1) ensures the PerformanceCycle / PerformanceReview indexes exist (syncIndexes), and
 *   2) prints the reference vocabularies so we can eyeball them on staging.
 *
 * It performs NO document writes. Re-running it is a no-op beyond index sync.
 *
 *   cd puc-backend && node scripts/seedPerformance.js
 *
 * Requires MONGODB_URI (or MONGO_URI / DATABASE_URL) in the environment / .env.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import PerformanceCycle from '../models/PerformanceCycle.js';
import PerformanceReview from '../models/PerformanceReview.js';
import { BEHAVIOURS, RATING_DESCRIPTIONS, buildPerformanceMeta } from '../utils/performanceEnums.js';

const run = async () => {
  await connectDB();

  // Build the indexes declared on the models (unique cycle×staff, manager queues, etc.).
  console.log('→ Syncing PerformanceCycle indexes...');
  await PerformanceCycle.syncIndexes();
  console.log('→ Syncing PerformanceReview indexes...');
  await PerformanceReview.syncIndexes();

  console.log('\n✓ Indexes in place. Reference data (code constants, not stored):');
  console.log(`  Behaviours (${BEHAVIOURS.length}): ${BEHAVIOURS.map((b) => b.name).join(', ')}`);
  console.log(`  Rating scale: ${RATING_DESCRIPTIONS.map((r) => `${r.rating}-${r.label}`).join(', ')}`);

  // Sanity-check the meta payload the frontend will consume.
  const meta = buildPerformanceMeta();
  console.log(`  /meta keys: ${Object.keys(meta).join(', ')}`);

  await mongoose.connection.close();
  console.log('\nDone. No documents were written.');
};

run().catch(async (err) => {
  console.error('seedPerformance failed:', err);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
