Chat Application with Node.js and Socket.IO

  This project is a real-time chat application built using Node.js and Socket.IO. It allows users to join    chat rooms and exchange messages in real-time.

Prerequisites

  Make sure you have the following installed:
  
  Node.js (v14 or higher recommended)
  
  npm package manager

Installation

  1. Clone the repository:
  
      git clone https://github.com/lokendra-hiteshi/chat-app-api.git
  
  2. Navigate to the project directory:
  
      cd chat-app-api
  
  3. Install dependencies:
  
      npm install
  
  4. Set up the PostgreSQL database:
  
     Create a new PostgreSQL database.

       -- Create the users table
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            socket_id VARCHAR(255),
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL
        );
        
        -- Create the rooms table
        CREATE TABLE rooms (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            creator_id INTEGER NOT NULL REFERENCES users(id),
            joiners INTEGER[] 
        );
        
        -- Create the messages table
        CREATE TABLE messages (
            id SERIAL PRIMARY KEY,
            content TEXT NOT NULL,
            sender_id INTEGER NOT NULL REFERENCES users(id),
            recipient_id INTEGER REFERENCES users(id), 
            room_id INTEGER REFERENCES rooms(id), 
            sender_info JSONB
        );
       
  
  Update the database connection details in the environment variables or configuration file.

Usage

  Start the server:
  
  npm start



Technologies Used

  Node.js: Backend runtime environment.
  
  Socket.IO: Real-time bidirectional communication.

  PostgreSQL: Relational database for persistent data storage.
  
Configuration

  You can update the server settings in the index.js file.


Contributions

  Contributions are welcome! Feel free to submit a pull request or open an issue.

  1. Fork the repository.

  2. Create a feature branch (git checkout -b feature-name).

  3. Commit your changes (git commit -m 'Add feature-name').

  4. Push to the branch (git push origin feature-name).

  5. Open a pull request.


