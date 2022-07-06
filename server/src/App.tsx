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

function App() {
  return (
      <Container>
	  <Header />
	  <hr />
	  <Content />
      </Container>
  );
}

export default App;
