import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import Product from "../models/product.model.js";

export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find({}); // encontrar todos os produtos
    res.json({ products });
  } catch (error) {
    console.log("Erro no controlador getAllProducts", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

export const getFeaturedProducts = async (req, res) => {
  try {
    let featuredProducts = await redis.get("featured_products");

    if (featuredProducts) {
      return res.json(JSON.parse(featuredProducts));
    }

    // se não estiver no redis, buscar no MongoDB
    // .lean() vai retornar um objeto JavaScript comum em vez de um documento do MongoDB
    // o que é bom para desempenho
    featuredProducts = await Product.find({ isFeatured: true }).lean();

    // armazenar no redis para acesso rápido futuro
    await redis.set("featured_products", JSON.stringify(featuredProducts));

    res.json(featuredProducts);
  } catch (error) {
    console.log("Erro no controlador getFeaturedProducts", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { name, description, price, image, category } = req.body;

    let cloudinaryResponse = null;

    if (image) {
      cloudinaryResponse = await cloudinary.uploader.upload(image, { folder: "products" });
    }

    const product = await Product.create({
      name,
      description,
      price,
      image: cloudinaryResponse?.secure_url ? cloudinaryResponse.secure_url : "",
      category,
    });

    res.status(201).json(product);
  } catch (error) {
    console.log("Erro no controlador createProduct", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Produto não encontrado" });
    }

    if (product.image) {
      const publicId = product.image.split("/").pop().split(".")[0];
      try {
        await cloudinary.uploader.destroy(`products/${publicId}`);
        console.log("imagem deletada do Cloudinary");
      } catch (error) {
        console.log("erro ao deletar imagem do Cloudinary", error);
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: "Produto deletado com sucesso" });
  } catch (error) {
    console.log("Erro no controlador deleteProduct", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

export const getRecommendedProducts = async (req, res) => {
  try {
    const products = await Product.aggregate([
      {
        $sample: { size: 4 },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          image: 1,
          price: 1,
        },
      },
    ]);

    res.json(products);
  } catch (error) {
    console.log("Erro no controlador getRecommendedProducts", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

export const getProductsByCategory = async (req, res) => {
  const { category } = req.params;
  try {
    const products = await Product.find({ category });
    res.json({ products });
  } catch (error) {
    console.log("Erro no controlador getProductsByCategory", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

export const toggleFeaturedProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      product.isFeatured = !product.isFeatured;
      const updatedProduct = await product.save();
      await updateFeaturedProductsCache();
      res.json(updatedProduct);
    } else {
      res.status(404).json({ message: "Produto não encontrado" });
    }
  } catch (error) {
    console.log("Erro no controlador toggleFeaturedProduct", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

async function updateFeaturedProductsCache() {
  try {
    // O método lean() é usado para retornar objetos JavaScript comuns em vez de documentos completos do Mongoose. Isso pode melhorar o desempenho
    const featuredProducts = await Product.find({ isFeatured: true }).lean();
    await redis.set("featured_products", JSON.stringify(featuredProducts));
  } catch (error) {
    console.log("erro na função de atualização do cache");
  }
}
