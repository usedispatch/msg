import React from 'react';
import logo from './logo.svg';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css'
import {
  Container
} from 'react-bootstrap';
import {
  Header,
  Content
} from './components';
import { Wallet } from './Wallet';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Wallet>
      <BrowserRouter>
        <Header />
        <hr />
        <Routes>
          <Route path="/" element={<Content />} />
        </Routes>
      </BrowserRouter>
    </Wallet>
  );
}

export default App;
