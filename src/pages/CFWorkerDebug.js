import React, { useState } from 'react';
import '../styles/debug.css';

const CFWorkerDebug = () => {
  const [workerUrl, setWorkerUrl] = useState('http://localhost:8787');
  const [testPrompt, setTestPrompt] = useState('Tell me a short story about a brave knight.');
  const [selectedModel, setSelectedModel] = useState('@cf/meta/llama-3.1-8b-instruct-fast');
  const [maxTokens, setMaxTokens] = useState(100);
  const [temperature, setTemperature] = useState(0.7);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState(null);

  const availableModels = [
    { id: '@cf/meta/llama-3.1-8b-instruct-fast', name: 'Llama 3.1 8B Fast' },
    { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B' },
    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B' }
  ];

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    setHealthStatus(null);
    
    try {
      const response = await fetch(`${workerUrl}/health`);
      const data = await response.json();
      setHealthStatus({
        status: response.status,
        data
      });
    } catch (err) {
      setError(`Health check failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testGenerate = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const requestBody = {
        provider: 'cf-workers',
        model: selectedModel,
        prompt: testPrompt,
        maxTokens: parseInt(maxTokens),
        temperature: parseFloat(temperature)
      };

      console.log('Sending request:', requestBody);

      const res = await fetch(`${workerUrl}/api/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      setResponse({
        status: res.status,
        data
      });
    } catch (err) {
      setError(`Generation failed: ${err.message}`);
      console.error('Error details:', err);
    } finally {
      setLoading(false);
    }
  };

  const testModels = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch(`${workerUrl}/api/ai/models`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      setResponse({
        status: res.status,
        data
      });
    } catch (err) {
      setError(`Models fetch failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container debug-page">
      <div className="page-header">
        <h1>Cloudflare Workers AI Debug</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '10px' }}>
          Test your CF Worker AI integration
        </p>
      </div>

      <div className="debug-section">
        <h3>Configuration</h3>
        <div className="form-group">
          <label>Worker URL:</label>
          <input
            type="text"
            value={workerUrl}
            onChange={(e) => setWorkerUrl(e.target.value)}
            placeholder="http://localhost:8787"
          />
        </div>
      </div>

      <div className="debug-section">
        <h3>Quick Tests</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={checkHealth} disabled={loading} className="primary-button">
            Check Health
          </button>
          <button onClick={testModels} disabled={loading} className="primary-button">
            List Models
          </button>
        </div>
      </div>

      <div className="debug-section">
        <h3>Test Generation</h3>
        <div className="form-group">
          <label>Model:</label>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            {availableModels.map(model => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Prompt:</label>
          <textarea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            rows={4}
            placeholder="Enter your test prompt..."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div className="form-group">
            <label>Max Tokens:</label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              min="1"
              max="2048"
            />
          </div>

          <div className="form-group">
            <label>Temperature:</label>
            <input
              type="number"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              min="0"
              max="2"
              step="0.1"
            />
          </div>
        </div>

        <button onClick={testGenerate} disabled={loading} className="primary-button">
          {loading ? 'Testing...' : 'Test Generate'}
        </button>
      </div>

      {loading && (
        <div className="debug-section" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--primary)' }}>⏳ Loading...</p>
        </div>
      )}

      {error && (
        <div className="debug-section error-section">
          <h3 style={{ color: 'var(--state-danger)' }}>❌ Error</h3>
          <pre style={{ 
            background: 'var(--surface)', 
            padding: '15px', 
            borderRadius: '4px',
            overflow: 'auto',
            color: 'var(--state-danger)'
          }}>
            {error}
          </pre>
        </div>
      )}

      {healthStatus && (
        <div className="debug-section success-section">
          <h3 style={{ color: 'var(--state-success)' }}>✓ Health Check Response</h3>
          <p><strong>Status:</strong> {healthStatus.status}</p>
          <pre style={{ 
            background: 'var(--surface)', 
            padding: '15px', 
            borderRadius: '4px',
            overflow: 'auto'
          }}>
            {JSON.stringify(healthStatus.data, null, 2)}
          </pre>
        </div>
      )}

      {response && (
        <div className="debug-section success-section">
          <h3 style={{ color: 'var(--state-success)' }}>✓ Response</h3>
          <p><strong>Status:</strong> {response.status}</p>
          <pre style={{ 
            background: 'var(--surface)', 
            padding: '15px', 
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '400px'
          }}>
            {JSON.stringify(response.data, null, 2)}
          </pre>
        </div>
      )}

      <div className="debug-section" style={{ marginTop: '30px' }}>
        <h3>Instructions</h3>
        <ol style={{ lineHeight: '1.8', color: 'var(--text-secondary)' }}>
          <li>Make sure your CF Worker is running: <code>cd cf-worker && npm run dev</code></li>
          <li>Click "Check Health" to verify the worker is accessible</li>
          <li>Click "List Models" to see available AI models</li>
          <li>Configure a prompt and click "Test Generate" to test AI generation</li>
          <li>Check the browser console for detailed request/response logs</li>
        </ol>
      </div>
    </div>
  );
};

export default CFWorkerDebug;
