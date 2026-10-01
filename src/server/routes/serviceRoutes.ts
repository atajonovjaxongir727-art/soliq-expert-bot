import { Router } from 'express';
import { prisma, logActivity } from '../../database/db.js';
import { requireAdminAuth } from '../middlewares/auth.js';

export const serviceRouter = Router();

serviceRouter.get('/', async (req, res) => {
  const services = await prisma.service.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  return res.json(services);
});

serviceRouter.post('/', requireAdminAuth, async (req, res) => {
  const { code, nameUz, nameRu, descriptionUz, descriptionRu, price, priceText, isActive, sortOrder } = req.body;
  const created = await prisma.service.create({
    data: {
      code,
      nameUz,
      nameRu,
      descriptionUz,
      descriptionRu,
      price: parseInt(price, 10),
      priceText,
      isActive: isActive ?? true,
      sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
    },
  });
  await logActivity('SERVICE_CREATED', `Yangi tarif yaratildi: ${nameUz}`);
  return res.json(created);
});

serviceRouter.put('/:id', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const { nameUz, nameRu, descriptionUz, descriptionRu, price, priceText, isActive, sortOrder } = req.body;
  const updated = await prisma.service.update({
    where: { id },
    data: {
      nameUz,
      nameRu,
      descriptionUz,
      descriptionRu,
      price: price !== undefined ? parseInt(price, 10) : undefined,
      priceText,
      isActive,
      sortOrder: sortOrder !== undefined ? parseInt(sortOrder, 10) : undefined,
    },
  });
  await logActivity('SERVICE_UPDATED', `Tarif yangilandi: ${nameUz} (ID: ${id})`);
  return res.json(updated);
});
