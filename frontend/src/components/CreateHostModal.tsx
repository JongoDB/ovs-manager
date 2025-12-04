import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Alert,
} from '@mui/material';
import { hostsApi, CreateHostRequest } from '../services/api';

interface CreateHostModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CreateHostModal: React.FC<CreateHostModalProps> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState<CreateHostRequest>({
    name: '',
    hostname: '',
    port: 22,
    username: 'root',
    ssh_key_path: '',
    password: '',
    description: '',
  });
  const [authMethod, setAuthMethod] = useState<'key' | 'password'>('key');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    // Validate that either key or password is provided
    if (authMethod === 'key' && !formData.ssh_key_path) {
      setError('SSH key path is required when using key authentication');
      setLoading(false);
      return;
    }
    if (authMethod === 'password' && !formData.password) {
      setError('Password is required when using password authentication');
      setLoading(false);
      return;
    }

    try {
      const requestData: CreateHostRequest = {
        name: formData.name,
        hostname: formData.hostname,
        port: formData.port,
        username: formData.username,
        description: formData.description || undefined,
      };

      if (authMethod === 'key') {
        requestData.ssh_key_path = formData.ssh_key_path;
      } else {
        requestData.password = formData.password;
      }

      await hostsApi.create(requestData);
      onSuccess();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create host';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Proxmox Host</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Host Name/Identifier"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            fullWidth
            placeholder="e.g., proxmox-01"
            helperText="Unique identifier for this host"
          />

          <TextField
            label="Hostname/IP Address"
            value={formData.hostname}
            onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
            required
            fullWidth
            placeholder="192.168.1.10 or hostname.example.com"
          />

          <TextField
            label="SSH Port"
            type="number"
            value={formData.port}
            onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
            required
            fullWidth
            inputProps={{ min: 1, max: 65535 }}
          />

          <TextField
            label="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
            fullWidth
            placeholder="root"
          />

          <FormControl fullWidth>
            <InputLabel>Authentication Method</InputLabel>
            <Select
              value={authMethod}
              label="Authentication Method"
              onChange={(e) => setAuthMethod(e.target.value as 'key' | 'password')}
            >
              <MenuItem value="key">SSH Key</MenuItem>
              <MenuItem value="password">Password</MenuItem>
            </Select>
          </FormControl>

          {authMethod === 'key' ? (
            <TextField
              label="SSH Key Path"
              value={formData.ssh_key_path}
              onChange={(e) => setFormData({ ...formData, ssh_key_path: e.target.value })}
              required
              fullWidth
              placeholder="/root/.ssh/id_rsa"
              helperText="Path to SSH private key on the server running OVS Manager"
            />
          ) : (
            <TextField
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              fullWidth
              placeholder="Enter password"
              helperText="Note: Password is stored in database. SSH keys are more secure."
            />
          )}

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            placeholder="Optional description"
            multiline
            rows={2}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !formData.name || !formData.hostname || !formData.username}
        >
          {loading ? 'Creating...' : 'Create Host'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateHostModal;
