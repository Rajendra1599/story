# MicroDrama OTT Backend Server

Production-ready backend server for the **MicroDrama OTT Android App**, handling:
- **PhonePe UPI & AutoPay Mandates**: Order creation, SHA256 checksum generation, and S2S webhook callbacks.
- **Strict Payment Verification**: Only activates VIP membership after confirmed completion.
- **1-Day Free Trial Management**: 24-hour VIP pass for users reaching Episode 6+.
- **Episode Streaming Authorization**: Episodes 1–5 are free; Episode 6+ is strictly gated behind an active VIP status.

---

## 🚀 Quick Start (Local Run)

1. **Navigate to the backend folder**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your PhonePe Merchant ID & Salt Key in `.env`.

4. **Start the server**:
   ```bash
   npm start
   # Server runs on http://localhost:5000
   ```

---

## 🌐 Deploy to Server (Hosting Options)

### Option 1: Deploy on Render (Free & Recommended)
1. Go to [Render.com](https://render.com) and create an account.
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (or select root directory: `backend`).
4. Set the following settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. In the **Environment Variables** section, add:
   - `PORT`: `5000`
   - `PHONEPE_MERCHANT_ID`: Your PhonePe Merchant ID
   - `PHONEPE_SALT_KEY`: Your PhonePe Salt Key
   - `PHONEPE_SALT_INDEX`: `1`
   - `PHONEPE_VPA`: `microdrama.autopay@ybl`
6. Click **Deploy Web Service**. You will get a live URL like:
   `https://microdrama-backend.onrender.com`
7. Update `BACKEND_API_BASE_URL` in the Android `.env` with your Render URL!

---

### Option 2: Deploy on Railway
1. Go to [Railway.app](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub Repo**.
3. Select the repository and set Root Directory to `/backend`.
4. Railway will auto-detect Node.js and deploy.
5. In the **Variables** tab, add your PhonePe environment variables.

---

### Option 3: Deploy on VPS (Ubuntu / Linux with PM2 & NGINX)
1. Clone your repo or copy the `backend` folder to your server:
   ```bash
   cd /var/www/microdrama-backend
   npm install --production
   ```
2. Install PM2 process manager:
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name "microdrama-api"
   pm2 startup
   pm2 save
   ```
3. Set up NGINX Reverse Proxy to forward port 80/443 to `http://localhost:5000`.

---

### Option 4: Deploy using Docker
```bash
docker build -t microdrama-backend .
docker run -d -p 5000:5000 --env-file .env.example microdrama-backend
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & system stats |
| `POST` | `/api/payment/initiate` | Initiates PhonePe UPI order in `PENDING` state |
| `POST` | `/api/payment/verify` | Confirms payment completion & activates VIP |
| `POST` | `/api/payment/cancel` | Marks payment cancelled |
| `POST` | `/api/payment/webhook` | PhonePe S2S webhook listener |
| `GET` | `/api/subscription/:userId` | Checks active VIP status & expiration |
| `POST` | `/api/subscription/activate-1day-trial` | Grants 1-Day Free Trial pass |
| `POST` | `/api/episodes/authorize` | Authorizes video stream (Episodes 1-5 Free, 6+ VIP) |
| `GET` | `/api/dramas` | Returns series catalog |
