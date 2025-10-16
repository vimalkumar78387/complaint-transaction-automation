import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Database } from '../services/database';

interface ExtendedRequest extends Request {
  database: Database;
  user?: any;
}

export class AuthController {

  // Login
  static async login(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // For demo purposes, we'll use a simple check
      // In production, you'd have a proper users table
      const validCredentials = [
        { email: 'admin@company.com', password: 'admin123', role: 'admin' },
        { email: 'support@company.com', password: 'support123', role: 'support' },
        { email: 'merchant@company.com', password: 'merchant123', role: 'merchant' }
      ];

      const user = validCredentials.find(u => u.email === email);
      
      if (!user || password !== user.password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Generate JWT token
      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
      const token = (jwt.sign as any)(
        { 
          id: email, 
          email: user.email, 
          role: user.role 
        },
        jwtSecret,
        { expiresIn: jwtExpiresIn }
      );

      // Generate refresh token
      const refreshToken = (jwt.sign as any)(
        { id: email, type: 'refresh' },
        jwtSecret,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: email,
            email: user.email,
            role: user.role
          },
          token,
          refreshToken
        }
      });

    } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).json({
        success: false,
        message: 'Login failed'
      });
    }
  }

  // Register (for admin setup)
  static async register(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { email, password, role = 'support' } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // Hash password (for future use in real implementation)
      await bcrypt.hash(password, 10);

      // In a real implementation, you'd save to a users table
      console.log(`User registration: ${email} with role ${role}`);
      
      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          email,
          role
        }
      });

    } catch (error) {
      console.error('Error during registration:', error);
      return res.status(500).json({
        success: false,
        message: 'Registration failed'
      });
    }
  }

  // Logout
  static async logout(_req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      // In a real implementation, you might blacklist the token
      return res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Error during logout:', error);
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
  }

  // Get current user
  static async getCurrentUser(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      return res.json({
        success: true,
        data: {
          user: {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role
          }
        }
      });

    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  }

  // Refresh token
  static async refreshToken(req: ExtendedRequest, res: Response): Promise<Response> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      const jwtSecretVerify = process.env.JWT_SECRET || 'your-secret-key';
      const decoded = jwt.verify(refreshToken, jwtSecretVerify) as any;

      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Generate new access token
      const jwtSecretRefresh = process.env.JWT_SECRET || 'your-secret-key';
      const jwtExpiresInRefresh = process.env.JWT_EXPIRES_IN || '24h';
      const newToken = (jwt.sign as any)(
        { 
          id: decoded.id, 
          email: decoded.email, 
          role: decoded.role 
        },
        jwtSecretRefresh,
        { expiresIn: jwtExpiresInRefresh }
      );

      return res.json({
        success: true,
        data: {
          token: newToken
        }
      });

    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
  }
}