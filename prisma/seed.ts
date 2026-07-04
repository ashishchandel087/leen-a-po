import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Passwords come from env so production never ships the weak demo defaults.
  // Set SEED_ADMIN_PASSWORD / SEED_LEENA_PASSWORD before seeding a real deploy.
  const adminPw = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const leenaPw = process.env.SEED_LEENA_PASSWORD || "leena123";
  if (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_LEENA_PASSWORD) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Refusing to seed production with default demo passwords. " +
          "Set SEED_ADMIN_PASSWORD and SEED_LEENA_PASSWORD and re-run."
      );
    }
    console.warn(
      "⚠️  Using default demo passwords. Set SEED_ADMIN_PASSWORD and " +
        "SEED_LEENA_PASSWORD env vars for anything beyond local dev."
    );
  }

  // Create admin user (you)
  const adminPassword = await bcrypt.hash(adminPw, 10);
  const admin = await prisma.user.upsert({
    where: { email: "ashish@leen-a-po.com" },
    update: {},
    create: {
      email: "ashish@leen-a-po.com",
      password: adminPassword,
      name: "Ashish",
      role: "admin",
    },
  });

  // Create GF user
  const gfPassword = await bcrypt.hash(leenaPw, 10);
  const gf = await prisma.user.upsert({
    where: { email: "leena@leen-a-po.com" },
    update: {},
    create: {
      email: "leena@leen-a-po.com",
      password: gfPassword,
      name: "Leena",
      role: "user",
    },
  });

  // Add a couple of bucket list items
  const existingItems = await prisma.bucketItem.count();
  if (existingItems === 0) {
    await prisma.bucketItem.createMany({
      data: [
        { title: "Watch a meteor shower together 🌠", addedById: admin.id },
        { title: "Cook a new recipe together 🍳", addedById: admin.id },
        { title: "Take a spontaneous road trip 🚗", addedById: gf.id },
      ],
    });
  }

  console.log("✅ Seed complete!");
  console.log("Admin:", admin.email);
  console.log("GF:", gf.email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1; // fail CI/deploy scripts on a broken seed
  })
  .finally(() => prisma.$disconnect());
