import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Nome de produto é obrigatório"],
    },
    description: {
      type: String,
      required: [true, "Descrição de produto é obrigatória"],
    },
    price: {
      type: Number,
      min: [0, "Preço de produto deve ser maior que zero"],
      required: [true, "Preço de produto é obrigatório"],
    },
    image: {
      type: String,
      required: [true, "Imagem de produto é obrigatória"],
    },
    category: {
      type: String,
      required: [true, "Categoría de produto é obrigatória"],
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Product = mongoose.model("Product", productSchema);

export default Product;
