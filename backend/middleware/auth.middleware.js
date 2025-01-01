import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { redis } from "../lib/redis.js";

export const protectRoute = async (req, res, next) => {
  try {
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
      return res.status(401).json({
        message: "Não autorizado - Token de acesso não informado",
        code: "NO_TOKEN",
      });
    }

    try {
      const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      const { userId, sessionId } = decoded;

      // Verifica se existe uma sessão válida no Redis
      const storedSession = await redis.get(`refresh_token:${sessionId}`);
      if (!storedSession) {
        return res.status(401).json({
          message: "Sessão inválida",
          code: "INVALID_SESSION",
        });
      }

      const user = await User.findById(userId).select("-password");
      if (!user) {
        return res.status(401).json({
          message: "Usuário não encontrado",
          code: "USER_NOT_FOUND",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "Token expirado",
          code: "TOKEN_EXPIRED",
        });
      }
      throw error;
    }
  } catch (error) {
    console.log("Erro em protectRoute middleware:", error);
    return res.status(401).json({
      message: "Não autorizado - Erro ao processar token",
      code: "TOKEN_ERROR",
    });
  }
};

export const adminRoute = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({ message: "Acesso negado - Apenas Administradores" });
  }
};
