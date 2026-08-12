-- Multimodal image embeddings for AI match similarity (separate from text embedding).
ALTER TABLE "item" ADD COLUMN "image_embedding" JSONB;
ALTER TABLE "claim" ADD COLUMN "image_embedding" JSONB;
