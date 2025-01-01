import Coupon from "../models/coupon.model.js";

export const getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ userId: req.user._id, isActive: true });
    res.json(coupon || null);
  } catch (error) {
    console.log("Erro no controlador getCoupon", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

export const validateCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const coupon = await Coupon.findOne({ code: code, userId: req.user._id, isActive: true });

    if (!coupon) {
      return res.status(404).json({ message: "Cupom não encontrado" });
    }

    if (coupon.expirationDate < new Date()) {
      coupon.isActive = false;
      await coupon.save();
      return res.status(404).json({ message: "Cupom expirado" });
    }

    res.json({
      message: "Cupom válido",
      code: coupon.code,
      discountPercentage: coupon.discountPercentage,
    });
  } catch (error) {
    console.log("Erro no controlador validateCoupon", error.message);
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};
