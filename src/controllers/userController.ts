import { Response } from 'express';
import prisma from '../config/db.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';

// 1. GET PROFIL SAYA SENDIRI (AMANKAN DENGAN JWT TOKEN)
export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // req.user diisi oleh middleware authenticateToken dari token JWT
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: {
        id: true,
        name: true,
        email: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching current user profile'
    });
  }
};

// 2. GET ALL USERS (DISABLED SEMENTARA demi keamanan)
export const getAllUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.status(403).json({
    success: false,
    message: 'Access denied: Route disabled for security reasons'
  });
};

// 3. GET USER BY ID (DISABLED SEMENTARA demi keamanan)
export const getUserById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.status(403).json({
    success: false,
    message: 'Access denied: Route disabled for security reasons'
  });
};

// export const getAllUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
//   try {
//     const users = await prisma.user.findMany({
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         isVerified: true,
//         createdAt: true,
//         updatedAt: true
//       }
//     });

//     res.status(200).json({
//       success: true,
//       data: users
//     });
//   } catch (error: any) {
//     res.status(500).json({
//       success: false,
//       message: 'An error occurred while fetching users'
//     });
//   }
// };

// export const getUserById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
//   const { id } = req.params;

//   if (isNaN(Number(id))) {
//     res.status(400).json({ success: false, message: 'Invalid user ID format' });
//     return;
//   }

//   try {
//     const user = await prisma.user.findUnique({
//       where: { id: Number(id) },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         isVerified: true,
//         createdAt: true,
//         updatedAt: true
//       }
//     });

//     if (!user) {
//       res.status(404).json({ success: false, message: 'User not found' });
//       return;
//     }

//     res.status(200).json({
//       success: true,
//       data: user
//     });
//   } catch (error: any) {
//     res.status(500).json({
//       success: false,
//       message: 'An error occurred while fetching user profile'
//     });
//   }
// };