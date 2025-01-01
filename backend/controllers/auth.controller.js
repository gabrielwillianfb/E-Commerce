import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const generateTokens = (userId) => {
  const sessionId = uuidv4();

  const accessToken = jwt.sign({ userId, sessionId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign({ userId, sessionId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken, sessionId };
};

const storeRefreshToken = async (sessionId, userId, refreshToken) => {
  await redis.set(
    `refresh_token:${sessionId}`,
    JSON.stringify({ userId, refreshToken }),
    "EX",
    7 * 24 * 60 * 60,
  );
};

const setCookies = (res, accessToken, refreshToken) => {
  if (accessToken) {
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });
  }

  if (refreshToken) {
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }
};

export const signup = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "Usuário já existe" });
    }
    const user = await User.create({ name, email, password });

    // autenticar
    const { accessToken, refreshToken, sessionId } = generateTokens(user._id);
    await storeRefreshToken(sessionId, user._id, refreshToken);

    setCookies(res, accessToken, refreshToken);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.log("Erro no controlador de cadastro", error.message);
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.comparePassword(password))) {
      const { accessToken, refreshToken, sessionId } = generateTokens(user._id);
      await storeRefreshToken(sessionId, user._id, refreshToken);
      setCookies(res, accessToken, refreshToken);

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } else {
      res.status(400).json({ message: "Email ou senha inválidos" });
    }
  } catch (error) {
    console.log("Erro no controlador de login", error.message);
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(400).json({ message: "Nenhum token para revogar" });

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const session = await redis.get(`refresh_token:${decoded.sessionId}`);

    if (!session || JSON.parse(session).refreshToken !== refreshToken) {
      return res.status(400).json({ message: "Token inválido ou já revogado" });
    }

    await redis.del(`refresh_token:${decoded.sessionId}`);
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.json({ message: "Logout bem-sucedido" });
  } catch (error) {
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};

// isto irá atualizar o token de acesso
export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: "Nenhum token de atualização fornecido" });
    }

    // Decodifica o token para obter o sessionId
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const { userId, sessionId } = decoded;

    // Busca o token armazenado no Redis usando o sessionId
    const storedSession = await redis.get(`refresh_token:${sessionId}`);
    if (!storedSession) {
      console.log("Sessão não encontrada no Redis");
      return res.status(401).json({ message: "Sessão inválida" });
    }

    const { refreshToken: storedRefreshToken } = JSON.parse(storedSession);

    // Verifica se o token enviado é o mesmo que está armazenado
    if (refreshToken !== storedRefreshToken) {
      console.log("Token enviado não corresponde ao armazenado no Redis");
      await redis.del(`refresh_token:${sessionId}`);
      return res.status(401).json({ message: "Token inválido" });
    }

    // Busca o usuário
    const user = await User.findById(userId).select("-password");
    if (!user) {
      console.log("Usuário não encontrado");
      await redis.del(`refresh_token:${sessionId}`);
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    // Gera novos tokens
    const tokens = generateTokens(user._id);
    
    // Armazena novo refresh token no Redis
    await storeRefreshToken(tokens.sessionId, user._id, tokens.refreshToken);
    
    // Remove a sessão antiga
    await redis.del(`refresh_token:${sessionId}`);

    // Define os novos cookies
    setCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    console.log("Erro no refresh token:", error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Token inválido" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expirado" });
    }
    res.status(401).json({ message: "Erro ao processar token" });
  }
};

export const getProfile = async (req, res) => {
  try {
    res.json(req.user);
  } catch (error) {
    res.status(500).json({ message: "Erro no servidor", error: error.message });
  }
};
