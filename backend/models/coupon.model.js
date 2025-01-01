import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Código do cupom é obrigatório"],
      unique: true,
    },
    discountPercentage: {
      type: Number,
      required: [true, "Porcentagem de desconto é obrigatória"],
      min: 0,
      max: 100,
    },
    expirationDate: {
      type: Date,
      required: [true, "Data de expiração do cupom é obrigatória"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "ID do usuário é obrigatório"],
      unique: true,
    },
  },
  {
    timestamps: true,
  },
);

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;
