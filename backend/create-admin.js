import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  // Requerir password fuerte vía env — sin defaults inseguros.
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password || password.length < 12) {
    console.error('❌ ADMIN_INITIAL_PASSWORD env var requerida (mínimo 12 caracteres).');
    console.error('   Ejemplo: ADMIN_INITIAL_PASSWORD="$(openssl rand -base64 18)" node create-admin.js');
    process.exit(1);
  }

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
    const hashedPassword = await bcrypt.hash(password, 10);

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
    console.log('   Email: admin@tote.com');
    console.log('   ID:', admin.id);
    console.log('   Password: (la que pasaste por ADMIN_INITIAL_PASSWORD)');
  } catch (error) {
    console.error('❌ Error al crear admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
