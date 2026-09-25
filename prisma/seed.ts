import { PrismaClient, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

const defaultCategories = [
  // EXPENSE CATEGORIES
  { name: 'Food & Beverage', type: TransactionType.EXPENSE, icon: 'utensils', color: '#ef4444' },
  { name: 'Transportation', type: TransactionType.EXPENSE, icon: 'car', color: '#f97316' },
  { name: 'Shopping', type: TransactionType.EXPENSE, icon: 'shopping-bag', color: '#ec4899' },
  { name: 'Bills & Utilities', type: TransactionType.EXPENSE, icon: 'receipt', color: '#6366f1' },
  { name: 'Entertainment', type: TransactionType.EXPENSE, icon: 'film', color: '#a855f7' },
  { name: 'Health & Medical', type: TransactionType.EXPENSE, icon: 'activity', color: '#14b8a6' },
  
  // INCOME CATEGORIES
  { name: 'Salary', type: TransactionType.INCOME, icon: 'wallet', color: '#22c55e' },
  { name: 'Freelance & Business', type: TransactionType.INCOME, icon: 'briefcase', color: '#10b981' },
  { name: 'Investment Return', type: TransactionType.INCOME, icon: 'trending-up', color: '#06b6d4' },
  { name: 'Gift & Bonus', type: TransactionType.INCOME, icon: 'gift', color: '#eab308' },
];

async function main() {
  console.log('🌱 Seeding default categories...');

  for (const category of defaultCategories) {
    const exists = await prisma.category.findFirst({
      where: { name: category.name, userId: null },
    });

    if (!exists) {
      await prisma.category.create({
        data: category,
      });
    }
  }

  console.log('✅ Default categories seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });