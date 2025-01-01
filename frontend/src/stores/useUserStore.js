import { create } from "zustand";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";

export const useUserStore = create((set, get) => ({
  user: null,
  loading: false,
  checkingAuth: true,
  retryCount: 0,
  maxRetries: 3,

  signup: async ({ name, email, password, confirmPassword }) => {
    set({ loading: true });

    if (password !== confirmPassword) {
      set({ loading: false });
      return toast.error("As senhas não correspondem");
    }

    try {
      const res = await axios.post("/auth/signup", { name, email, password });
      set({ user: res.data, loading: false });
    } catch (error) {
      set({ loading: false });
      toast.error(error.response.data.message || "Ocorreu um erro");
    }
  },
  login: async (email, password) => {
    set({ loading: true });

    try {
      const res = await axios.post("/auth/login", { email, password });

      set({ user: res.data, loading: false });
    } catch (error) {
      set({ loading: false });
      toast.error(error.response.data.message || "Ocorreu um erro");
    }
  },

  logout: async () => {
    try {
      await axios.post("/auth/logout");
      set({ user: null });
    } catch (error) {
      toast.error(error.response?.data?.message || "Ocorreu um erro durante o logout");
    }
  },

  checkAuth: async () => {
    const store = get();
    // console.log("🔍 Iniciando checkAuth - Tentativa", store.retryCount + 1);
    set({ checkingAuth: true });

    try {
      const { data: userData } = await axios.get("/auth/profile");
      set({ user: userData, checkingAuth: false, retryCount: 0 });
      return true;
    } catch (error) {
      // Verifica se o erro é por falta de token (usuário não logado)
      if (error.response?.data?.code === "NO_TOKEN") {
        // console.log("📝 Usuário não logado - finalizando verificação");
        set({ user: null, checkingAuth: false, retryCount: 0 });
        return false;
      }

      // Se for outro tipo de erro 401 (token expirado, inválido, etc) e ainda não atingiu max retries
      if (error.response?.status === 401 && store.retryCount < store.maxRetries) {
        // console.log("⏳ Agendando nova tentativa em 1 segundo");
        set({ retryCount: store.retryCount + 1 });
        setTimeout(() => {
          store.checkAuth();
        }, 1000);
        return false;
      }

      // console.log("❌ Máximo de tentativas atingido ou erro não recuperável");
      set({ user: null, checkingAuth: false, retryCount: 0 });
      return false;
    }
  },

  refreshToken: async () => {
    // Prevent multiple simultaneous refresh attempts
    if (get().checkingAuth) return;

    set({ checkingAuth: true });
    try {
      const response = await axios.post("/auth/refresh-token");
      set({ checkingAuth: false });
      return response.data;
    } catch (error) {
      set({ user: null, checkingAuth: false });
      throw error;
    }
  },
}));

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Interceptor de requisição para adicionar cabeçalhos de autenticação
axios.interceptors.request.use(
  (config) => {
    // Não precisa adicionar o token manualmente pois está usando cookies
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Interceptor de resposta para handle de refresh token
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Se não é erro 401 ou já tentamos retry, rejeita direto
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Se for erro de NO_TOKEN, rejeita direto (usuário não logado)
    if (error.response?.data?.code === "NO_TOKEN") {
      return Promise.reject(error);
    }

    // Marca que esta requisição já tentou retry
    originalRequest._retry = true;

    if (!isRefreshing) {
      isRefreshing = true;

      try {
        await axios.post("/auth/refresh-token");

        // Se conseguiu, processa a fila de requisições que falharam
        processQueue(null);

        // E refaz a requisição original
        return axios(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        useUserStore.getState().logout();

        throw refreshError;
      } finally {
        isRefreshing = false;
      }
    }

    // Se já está refreshing, adiciona à fila
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    })
      .then(() => {
        return axios(originalRequest);
      })
      .catch((err) => {
        return Promise.reject(err);
      });
  },
);
