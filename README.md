# Pet Adoption Server

This repository contains the backend server for the **Pet Adoption Web Application**, built using Node.js and Express. The server provides APIs for managing user authentication, pet listings, payment processing, and more.

## Features

- **Express Framework**: Lightweight and fast API development.
- **MongoDB Integration**: Data storage and retrieval for users, pets, and adoption-related data.
- **Authentication**: JSON Web Token (JWT)-based user authentication.
- **Payment Gateway**: Integration with Stripe for secure online payments.
- **CORS**: Cross-origin resource sharing enabled for secure communication with the client.
- **Logging**: Morgan is used for HTTP request logging.

## Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (version 16.x or above)
- [MongoDB](https://www.mongodb.com/)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pet-adoption-server.git
   cd pet-adoption-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add the following variables:
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   STRIPE_SECRET_KEY=your_stripe_secret_key
   ```

4. Start the server:
   ```bash
   npm start
   ```

## Folder Structure

```
pet-adoption-server/
├── node_modules/         # Installed dependencies
├── index.js              # Entry point of the application
├── routes/               # API route definitions
├── controllers/          # Business logic for API endpoints
├── models/               # Database models (e.g., User, Pet)
├── middlewares/          # Custom middleware (e.g., auth middleware)
├── .env                  # Environment variables
├── package.json          # Project configuration and dependencies
├── README.md             # Project documentation
```

## Available Scripts

- **Start the server**:
  ```bash
  npm start
  ```
  Runs the server using `nodemon` for automatic restarts during development.

- **Test**:
  Placeholder for tests. Update as needed.

## API Endpoints

### User Routes
- `POST /api/users/register`: Register a new user.
- `POST /api/users/login`: Log in a user and return a JWT token.

### Pet Routes
- `GET /api/pets`: Get a list of all pets available for adoption.
- `POST /api/pets`: Add a new pet (admin-only).
- `GET /api/pets/:id`: Get details of a specific pet.

### Payment Routes
- `POST /api/payments`: Process a Stripe payment.

## Technologies Used

- **Node.js**: Backend runtime environment.
- **Express**: Web framework for building APIs.
- **MongoDB**: NoSQL database for storing application data.
- **JWT**: Secure authentication.
- **Stripe**: Payment gateway integration.
- **dotenv**: Environment variable management.
- **Morgan**: HTTP request logger.
- **CORS**: Cross-origin resource sharing.

## Contributing

1. Fork the repository.
2. Create a new branch for your feature/bugfix:
   ```bash
   git checkout -b feature-name
   ```
3. Commit your changes:
   ```bash
   git commit -m "Description of changes"
   ```
4. Push your branch and create a pull request:
   ```bash
   git push origin feature-name
   ```

   [Netify](https://shiny-capybara-e3bc6b.netlify.app)
   [Firebase](https://pet-adoption-f983a.firebaseapp.com)
   [Surge](https://violet-egg.surge.sh)

## License

This project is licensed under the ISC License. See the LICENSE file for more details.

---

Happy coding! :tada:

