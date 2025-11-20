import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalError
} from '../../src/lib/errors.js'

describe('Error Classes', () => {
  describe('AppError', () => {
    it('creates error with all properties', () => {
      const error = new AppError(418, 'TEAPOT', 'I am a teapot', { brewTime: 3 })

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AppError)
      expect(error.statusCode).toBe(418)
      expect(error.code).toBe('TEAPOT')
      expect(error.message).toBe('I am a teapot')
      expect(error.details).toEqual({ brewTime: 3 })
      expect(error.name).toBe('AppError')
    })

    it('creates error without details', () => {
      const error = new AppError(500, 'SERVER_ERROR', 'Something went wrong')

      expect(error.statusCode).toBe(500)
      expect(error.code).toBe('SERVER_ERROR')
      expect(error.message).toBe('Something went wrong')
      expect(error.details).toBeUndefined()
    })

    it('has stack trace', () => {
      const error = new AppError(500, 'TEST', 'Test error')

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('AppError')
    })

    describe('toJSON', () => {
      it('serializes error with details', () => {
        const error = new AppError(400, 'BAD_REQUEST', 'Invalid input', { field: 'email' })
        const json = error.toJSON()

        expect(json).toEqual({
          error: 'BAD_REQUEST',
          message: 'Invalid input',
          details: { field: 'email' }
        })
      })

      it('serializes error without details', () => {
        const error = new AppError(404, 'NOT_FOUND', 'Resource not found')
        const json = error.toJSON()

        expect(json).toEqual({
          error: 'NOT_FOUND',
          message: 'Resource not found'
        })
      })

      it('does not include stack trace in JSON', () => {
        const error = new AppError(500, 'ERROR', 'Test')
        const json = error.toJSON()

        expect(json).not.toHaveProperty('stack')
        expect(json).not.toHaveProperty('name')
        expect(json).not.toHaveProperty('statusCode')
      })
    })
  })

  describe('NotFoundError', () => {
    it('creates 404 error with resource and id', () => {
      const error = new NotFoundError('Video', 'abc123')

      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.statusCode).toBe(404)
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('Video abc123 not found')
      expect(error.name).toBe('NotFoundError')
    })

    it('serializes to correct format', () => {
      const error = new NotFoundError('User', '123')
      const json = error.toJSON()

      expect(json).toEqual({
        error: 'NOT_FOUND',
        message: 'User 123 not found'
      })
    })

    it('works with different resource types', () => {
      const videoError = new NotFoundError('Video', 'vid-1')
      const personaError = new NotFoundError('Persona', 'persona-1')
      const ontologyError = new NotFoundError('Ontology', 'onto-1')

      expect(videoError.message).toBe('Video vid-1 not found')
      expect(personaError.message).toBe('Persona persona-1 not found')
      expect(ontologyError.message).toBe('Ontology onto-1 not found')
    })
  })

  describe('ValidationError', () => {
    it('creates 400 error with message', () => {
      const error = new ValidationError('Invalid email format')

      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(ValidationError)
      expect(error.statusCode).toBe(400)
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.message).toBe('Invalid email format')
      expect(error.name).toBe('ValidationError')
    })

    it('includes validation details', () => {
      const error = new ValidationError('Validation failed', {
        fields: ['email', 'password'],
        errors: ['email is required', 'password too short']
      })

      expect(error.details).toEqual({
        fields: ['email', 'password'],
        errors: ['email is required', 'password too short']
      })
    })

    it('serializes with details', () => {
      const error = new ValidationError('Invalid input', { field: 'username' })
      const json = error.toJSON()

      expect(json).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'username' }
      })
    })
  })

  describe('UnauthorizedError', () => {
    it('creates 401 error with custom message', () => {
      const error = new UnauthorizedError('Invalid credentials')

      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(UnauthorizedError)
      expect(error.statusCode).toBe(401)
      expect(error.code).toBe('UNAUTHORIZED')
      expect(error.message).toBe('Invalid credentials')
      expect(error.name).toBe('UnauthorizedError')
    })

    it('uses default message when not provided', () => {
      const error = new UnauthorizedError()

      expect(error.message).toBe('Authentication required')
    })

    it('serializes correctly', () => {
      const error = new UnauthorizedError('Token expired')
      const json = error.toJSON()

      expect(json).toEqual({
        error: 'UNAUTHORIZED',
        message: 'Token expired'
      })
    })
  })

  describe('ForbiddenError', () => {
    it('creates 403 error with custom message', () => {
      const error = new ForbiddenError('Admin access required')

      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(ForbiddenError)
      expect(error.statusCode).toBe(403)
      expect(error.code).toBe('FORBIDDEN')
      expect(error.message).toBe('Admin access required')
      expect(error.name).toBe('ForbiddenError')
    })

    it('uses default message when not provided', () => {
      const error = new ForbiddenError()

      expect(error.message).toBe('Insufficient permissions')
    })

    it('serializes correctly', () => {
      const error = new ForbiddenError('Cannot delete this resource')
      const json = error.toJSON()

      expect(json).toEqual({
        error: 'FORBIDDEN',
        message: 'Cannot delete this resource'
      })
    })
  })

  describe('ConflictError', () => {
    it('creates 409 error with message', () => {
      const error = new ConflictError('Username already exists')

      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(ConflictError)
      expect(error.statusCode).toBe(409)
      expect(error.code).toBe('CONFLICT')
      expect(error.message).toBe('Username already exists')
      expect(error.name).toBe('ConflictError')
    })

    it('includes conflict details', () => {
      const error = new ConflictError('Duplicate entry', {
        field: 'email',
        value: 'test@example.com'
      })

      expect(error.details).toEqual({
        field: 'email',
        value: 'test@example.com'
      })
    })

    it('serializes with details', () => {
      const error = new ConflictError('Resource already exists', { resourceId: '123' })
      const json = error.toJSON()

      expect(json).toEqual({
        error: 'CONFLICT',
        message: 'Resource already exists',
        details: { resourceId: '123' }
      })
    })
  })

  describe('InternalError', () => {
    it('creates 500 error with custom message', () => {
      const error = new InternalError('Database connection failed')

      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(InternalError)
      expect(error.statusCode).toBe(500)
      expect(error.code).toBe('INTERNAL_ERROR')
      expect(error.message).toBe('Database connection failed')
      expect(error.name).toBe('InternalError')
    })

    it('uses default message when not provided', () => {
      const error = new InternalError()

      expect(error.message).toBe('An unexpected error occurred')
    })

    it('includes error details', () => {
      const error = new InternalError('Processing failed', { cause: 'timeout' })

      expect(error.details).toEqual({ cause: 'timeout' })
    })

    it('serializes with details', () => {
      const error = new InternalError('Failed to process', { stage: 'validation' })
      const json = error.toJSON()

      expect(json).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Failed to process',
        details: { stage: 'validation' }
      })
    })
  })

  describe('Error inheritance', () => {
    it('all error types are instances of Error', () => {
      expect(new NotFoundError('Test', '1')).toBeInstanceOf(Error)
      expect(new ValidationError('Test')).toBeInstanceOf(Error)
      expect(new UnauthorizedError()).toBeInstanceOf(Error)
      expect(new ForbiddenError()).toBeInstanceOf(Error)
      expect(new ConflictError('Test')).toBeInstanceOf(Error)
      expect(new InternalError()).toBeInstanceOf(Error)
    })

    it('all error types are instances of AppError', () => {
      expect(new NotFoundError('Test', '1')).toBeInstanceOf(AppError)
      expect(new ValidationError('Test')).toBeInstanceOf(AppError)
      expect(new UnauthorizedError()).toBeInstanceOf(AppError)
      expect(new ForbiddenError()).toBeInstanceOf(AppError)
      expect(new ConflictError('Test')).toBeInstanceOf(AppError)
      expect(new InternalError()).toBeInstanceOf(AppError)
    })

    it('instanceof checks work correctly', () => {
      const notFound = new NotFoundError('Video', '123')
      const validation = new ValidationError('Invalid')

      expect(notFound instanceof NotFoundError).toBe(true)
      expect(notFound instanceof ValidationError).toBe(false)
      expect(validation instanceof ValidationError).toBe(true)
      expect(validation instanceof NotFoundError).toBe(false)
    })
  })
})
