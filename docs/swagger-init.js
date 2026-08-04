window.onload = () => {
  window.ui = SwaggerUIBundle({
    url: 'openapi.yml',
    dom_id: '#swagger-ui',
  });
};
