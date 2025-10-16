import express from 'express';
import { AuthController } from '../controllers/authController';

const router = express.Router();

// POST /api/auth/login - Login
router.post('/login', (req, res) => AuthController.login(req as any, res));

// POST /api/auth/register - Register (for admin setup)
router.post('/register', (req, res) => AuthController.register(req as any, res));

// POST /api/auth/logout - Logout
router.post('/logout', (req, res) => AuthController.logout(req as any, res));

// GET /api/auth/me - Get current user
router.get('/me', (req, res) => AuthController.getCurrentUser(req as any, res));

// POST /api/auth/refresh - Refresh token
router.post('/refresh', (req, res) => AuthController.refreshToken(req as any, res));

export default router;