import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { resolveScannedCode } from '../../services/scan.service';

export const scanRouter = Router();

scanRouter.use(requireAuth);

/**
 * The scanner's whole brain. A staff phone posts whatever the camera read — a URL from
 * a printed sticker, a bare token, a smudged order number — and the API answers with the
 * screen that code opens *for this role*. The browser is never asked to decide.
 */
scanRouter.post(
  '/',
  validate({ body: z.object({ code: z.string().min(1).max(400) }) }),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    res.json(await resolveScannedCode(auth.restaurantId, auth.role, req.body.code));
  }),
);
