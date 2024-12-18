-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,           
    name VARCHAR(255) NOT NULL,      
    email VARCHAR(255) UNIQUE NOT NULL, 
    password VARCHAR(255) NOT NULL,   
    socket_id VARCHAR(255),          
  
);


-- Create rooms table
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,               
    name VARCHAR(255) NOT NULL UNIQUE,          
    creator_id INT NOT NULL REFERENCES users(id),           
    joiners INT[] ,          
   
);

-- Create messages table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,               
    sender_id INT NOT NULL REFERENCES users(id),             
    recipient_id INT REFERENCES users(id),                   
    room_id INT REFERENCES rooms(id),                        
    content TEXT NOT NULL,              
    sender_info JSONB,                 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
   
);


