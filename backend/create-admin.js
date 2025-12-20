import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    // Verificar si ya existe
    const existingAdmin = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (existingAdmin) {
      console.log('✅ Usuario admin ya existe');
      return;
    }

    // Crear hash de la contraseña
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Crear usuario admin
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@tote.com',
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true
      }
    });

    console.log('✅ Usuario admin creado exitosamente');
    console.log('   Usuario: admin');
    console.log('   Contraseña: admin123');
    console.log('   Email: admin@tote.com');
    console.log('   ID:', admin.id);
  } catch (error) {
    console.error('❌ Error al crear admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
